import { test } from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import {
  activityQuerySchema,
  exportRequestSchema,
  calculateActivity,
  aggregateActivity,
  reportWindow,
  type ActivationEvent,
} from '../src/domain/activity';
import { centerGrants, hasPermission, type PortalActor } from '../src/domain/access';
import { getStore } from '../src/server/store';
import { activityCenters, getActivity } from '../src/server/activity/repository';
import { generateReportExport, reportHistory } from '../src/server/activity/exports';
import { activityWorkbook } from '../src/server/activity/workbook';

const center = {
  id: 101,
  type: 1 as const,
  name: '=SUM(1,2)',
  domain: 'example.test',
  active: true,
};
const query = activityQuerySchema.parse({ centerId: 101, centerType: 1, period: '2024-03' });
const event = (
  stamp: string,
  code: number,
  restoreActive: boolean | null = null,
): ActivationEvent => ({ childId: 1, id: 1, stamp, code, restoreActive });
const days = (events: ActivationEvent[], type: 1 | 3 | 4 = 1) =>
  calculateActivity(events, '2024-03', '2024-04-02', type);

test('activation calendar preserves exclusive legacy boundaries and rejects future months', () => {
  assert.deepEqual(reportWindow('2024-02', '2024-03-02'), {
    start: '2024-02-01',
    end: '2024-02-29',
    maxDays: 28,
  });
  assert.equal(reportWindow('2023-02', '2024-03-02').maxDays, 27);
  assert.equal(reportWindow('2024-03', '2024-03-01').maxDays, 0);
  assert.equal(reportWindow('2024-03', '2024-03-24').maxDays, 23);
  assert.throws(() => reportWindow('2024-05', '2024-04-02'));
  assert.deepEqual(days([]), { days: 30, future: 0, conflict: false, assumed: true });
  for (const n of [0, 1, 4, 5, 6, 13, 14]) {
    const day = String(n + 1).padStart(2, '0');
    assert.equal(days([event(`2024-03-${day} 09:00:00.000`, 3)]).days, n);
  }
});
test('activation handles latest prior events, repeated states, restore and conflicting timestamps', () => {
  assert.equal(days([event('2024-02-29 23:59:00.000', 3)]).days, 0);
  assert.equal(
    days([event('2024-02-02 08:00:00.000', 3), event('2024-02-29 23:59:00.000', 2)], 4).days,
    30,
  );
  assert.equal(
    days([event('2024-03-20 08:00:00.000', 3), event('2024-03-10 12:00:00.000', 2)]).days,
    10,
  );
  assert.equal(
    days([event('2024-02-29 08:00:00.000', 3), event('2024-03-06 12:00:00.000', 6, true)]).days,
    25,
  );
  assert.equal(days([event('2024-03-06 12:00:00.000', 6, false)]).days, 5);
  assert.equal(days([event('2024-03-06 12:00:00.000', 6, null)], 3).days, 25);
  assert.equal(days([event('2024-03-06 12:00:00.000', 6, false)], 4).days, 30);
  assert.equal(days([event('2024-03-06 12:00:00.000', 4)]).days, 30);
  assert.equal(
    days([event('2024-03-06 12:00:00.000', 1), event('2024-03-06 12:00:00.000', 2)]).days,
    25,
  );
  assert.equal(
    days([event('2024-03-06 12:00:00.000', 3), event('2024-03-06 12:00:00.000', 5)]).days,
    5,
  );
  assert.equal(
    days([event('2024-03-06 12:00:00.000', 2), event('2024-03-06 12:00:00.000', 3)]).days,
    null,
  );
  const future = calculateActivity(
    [event('2024-03-25 00:00:00.000', 3)],
    '2024-03',
    '2024-03-24',
    1,
  );
  assert.equal(future.days, 23);
  assert.equal(future.future, 1);
});
test('aggregate buckets distinguish zero and unresolved, deduplicate memberships and conserve demo totals', () => {
  const members = Array.from({ length: 7 }, (_, i) => ({
    childId: i + 1,
    classId: 1,
    demo: i === 3,
  }));
  const events = [0, 1, 5, 6, 13, 14].map((n, i) => ({
    ...event(`2024-03-${String(n + 1).padStart(2, '0')} 09:00:00.000`, 3),
    childId: i + 1,
  }));
  members.push({ childId: 7, classId: 2, demo: false }, { childId: 7, classId: 2, demo: false });
  const report = aggregateActivity(
    center,
    query,
    '2024-04-02',
    [
      { id: 1, name: 'Class A' },
      { id: 2, name: 'Class B' },
    ],
    members,
    events,
  );
  assert.deepEqual(report.totals.all, {
    registered: 7,
    zero: 1,
    short: 2,
    medium: 2,
    long: 2,
    unresolved: 0,
  });
  assert.equal(report.quality.assumedFull, 1);
  assert.equal(report.quality.overlappingStudents, 1);
  assert.equal(report.quality.duplicateEnrollments, 1);
  assert.equal(report.classes[1].all.registered, 1);
  for (const key of Object.keys(report.totals.all) as (keyof typeof report.totals.all)[])
    assert.equal(report.totals.all[key], report.totals.demo[key] + report.totals.nonDemo[key]);
  const invalid = aggregateActivity(
    center,
    query,
    '2024-04-02',
    [{ id: 1, name: 'Class A' }],
    [
      { childId: 1, classId: 1, demo: false, outsideHistory: true },
      { childId: 2, classId: 1, demo: false, invalidHistory: true },
    ],
    [],
  );
  assert.equal(invalid.totals.all.unresolved, 2);
  assert.equal(invalid.totals.all.zero, 0);
  assert.equal(invalid.quality.assumedFull, 0);
  assert.ok(!/childId|parentId|child_name|child_id/.test(JSON.stringify(report)));
});
test('report contracts reject mixed school batches, duplicate centers and forged fields', () => {
  const base = { period: '2024-03', includeDeleted: true, centers: [{ id: 101, type: 1 }] };
  assert.ok(exportRequestSchema.safeParse(base).success);
  for (const data of [
    { ...base, actor: 1 },
    { ...base, centers: [] },
    { ...base, centers: [...base.centers, ...base.centers] },
    { ...base, centers: [{ id: 102, type: 4 }] },
    { ...base, academicYearId: 2024 },
    {
      ...base,
      centers: [
        { id: 102, type: 4 },
        { id: 101, type: 1 },
      ],
      academicYearId: 2024,
    },
  ])
    assert.equal(exportRequestSchema.safeParse(data).success, false);
  assert.ok(
    exportRequestSchema.safeParse({
      ...base,
      centers: [{ id: 102, type: 4 }],
      academicYearId: 2024,
      includeDeleted: false,
    }).success,
  );
  assert.equal(
    activityQuerySchema.safeParse({
      centerId: 102,
      centerType: 4,
      period: '2024-03',
      academicYearId: 2024,
    }).success,
    false,
  );
});
test('workbooks contain aggregate sheets, numeric buckets and inert formula-looking names', async () => {
  const report = aggregateActivity(
    center,
    query,
    '2024-04-02',
    [{ id: 1, name: '@SUM(1,2)' }],
    [{ childId: 123456, classId: 1, demo: false }],
    [],
  );
  const buffer = await activityWorkbook([report]),
    book = new ExcelJS.Workbook();
  await book.xlsx.load(buffer as any);
  assert.deepEqual(
    book.worksheets.map((s) => s.name),
    ['Center summary', 'Class breakdown', 'Report rules'],
  );
  assert.equal(book.worksheets[0].getCell('A2').value, '=SUM(1,2)');
  assert.equal(book.worksheets[0].getCell('B2').value, 'Nursery');
  assert.equal(book.worksheets[0].getCell('H2').value, 1);
  assert.equal(book.worksheets[1].getCell('E2').value, '@SUM(1,2)');
  for (const sheet of book.worksheets)
    sheet.eachRow((row) =>
      row.eachCell((cell) => {
        assert.notEqual(cell.type, ExcelJS.ValueType.Formula);
        assert.ok(!String(cell.value).includes('123456'));
      }),
    );
});
test('report-only grants never expand profile access; repositories recheck grants and history is per actor and mode', async () => {
  process.env.ICARE_STORAGE_PATH = ':memory:';
  process.env.ICARE_LIVE_DATA_ENABLED = 'false';
  const store = getStore(),
    actor: PortalActor = {
      subject: 'preview:900002',
      dealerId: 900002,
      name: 'Jamie',
      username: 'demo.dealer',
      isSuperAdmin: false,
      mode: 'preview',
      active: true,
      expiresAt: Date.now() + 60000,
      grants: centerGrants(false, ['101_1', '103_1'], ['104_3', '102_4']),
      sessionId: 'activity-unit',
    };
  assert.equal(hasPermission(actor, 'reports.read', { id: 104, type: 3 }), true);
  assert.equal(hasPermission(actor, 'centers.read', { id: 104, type: 3 }), false);
  assert.equal(hasPermission(actor, 'users.manage', { id: 104, type: 3 }), false);
  assert.equal(hasPermission(actor, 'reports.read', { id: 102, type: 4 }), false);
  try {
    const catalog = await activityCenters(actor, { q: '', type: 'all', status: 'all', page: 1 });
    assert.equal(catalog.total, 3);
    const report = await getActivity(actor, { ...query, centerId: 104, centerType: 3 });
    assert.equal(report.totals.all.registered, 6);
    await assert.rejects(() =>
      getActivity(
        { ...actor, grants: centerGrants(true, []) },
        { ...query, centerId: 102, centerType: 4, academicYearId: 2026, includeDeleted: 'false' },
      ),
    );
    await assert.rejects(() =>
      activityCenters(actor, { q: '', type: 'all', status: 'all', page: 1, dealerId: 900001 }),
    );
    const data = exportRequestSchema.parse({
      period: '2024-03',
      includeDeleted: true,
      centers: [{ id: 104, type: 3 }],
    });
    await generateReportExport(actor, data);
    assert.equal(reportHistory(actor)[0].state, 'generated');
    assert.equal(reportHistory({ ...actor, dealerId: 900001 }).length, 0);
    assert.equal(reportHistory({ ...actor, mode: 'legacy' }).length, 0);
    store.db.prepare('DELETE FROM preview_report_grants WHERE dealer_id=?').run(actor.dealerId);
    await assert.rejects(() => generateReportExport(actor, data));
    assert.equal(reportHistory(actor)[0].state, 'failed');
  } finally {
    store.db.close();
  }
});
