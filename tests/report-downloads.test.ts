import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import ExcelJS from 'exceljs';
import { centerGrants, type PortalActor } from '../src/domain/access';
import {
  REPORT_COPY_MAX_BYTES,
  REPORT_COPY_GLOBAL_BYTES,
  REPORT_ACK_TTL,
  REPORT_DELIVERY_TTL,
  reportRetentionPlan,
  reportReceiptSchema,
} from '../src/domain/report-downloads';
import { generateReportExport } from '../src/server/activity/exports';
import {
  downloadReportCopy,
  acknowledgeReport,
  reportHistoryPage,
  reportDigest,
  retainReportCopy,
} from '../src/server/activity/report-copies';
import { getStore } from '../src/server/store';

process.env.ICARE_STORAGE_PATH = ':memory:';
process.env.ICARE_LIVE_DATA_ENABLED = 'false';
const actor: PortalActor = {
  subject: 'preview:900002',
  dealerId: 900002,
  mode: 'preview',
  name: 'Operator',
  username: 'demo.dealer',
  active: true,
  expiresAt: Date.now() + 600000,
  isSuperAdmin: false,
  sessionId: 'report-copy-test',
  grants: centerGrants(false, ['101_1', '103_1'], ['104_3']),
};
const admin: PortalActor = {
  ...actor,
  subject: 'preview:900001',
  dealerId: 900001,
  isSuperAdmin: true,
  grants: centerGrants(true, []),
};
const request = {
  period: '2024-03',
  includeDeleted: true,
  centers: [{ id: 101, type: 1 as const }],
};
beforeEach(() => {
  getStore().db.prepare("DELETE FROM throttle WHERE key LIKE 'report-%'").run();
});
const receipt = (id: string) => reportHistoryPage(actor).items.find((r) => r.id === id)!;

test('report retention bounds copies and evicts only oldest own files when a new save can succeed', () => {
  assert.equal(reportRetentionPlan([], 0, REPORT_COPY_MAX_BYTES).retained, true);
  assert.deepEqual(
    reportRetentionPlan([{ id: 'keep', bytes: 1 }], 1, REPORT_COPY_MAX_BYTES + 1).evict,
    [],
  );
  assert.equal(reportRetentionPlan([], REPORT_COPY_GLOBAL_BYTES, 1).retained, false);
  assert.deepEqual(
    reportRetentionPlan([{ id: 'old', bytes: 100 }], REPORT_COPY_GLOBAL_BYTES, 10).evict,
    ['old'],
  );
  assert.deepEqual(
    reportRetentionPlan([{ id: 'keep', bytes: 100 }], REPORT_COPY_GLOBAL_BYTES + 1000, 10).evict,
    [],
  );
  const many = Array.from({ length: 20 }, (_, i) => ({ id: `old-${i}`, bytes: 100 }));
  assert.deepEqual(reportRetentionPlan(many, 2000, 100).evict, ['old-0']);
  assert.equal(
    reportReceiptSchema.safeParse({ attemptId: randomUUID(), bytes: 10, centerId: 123 }).success,
    false,
  );
});
test('saved report downloads return identical bytes, filename and policy even after center profile changes', async () => {
  const generated = await generateReportExport(actor, request);
  assert.equal(generated.retained, true);
  assert.equal(receipt(generated.id).delivery.requests, 1);
  assert.equal(receipt(generated.id).delivery.browserReceipts, 0);
  const store = getStore(),
    row = store.db.prepare('SELECT profile FROM preview_centers WHERE id=101 AND type=1').get()!;
  const profile = JSON.parse(String(row.profile));
  store.db
    .prepare('UPDATE preview_centers SET profile=? WHERE id=101 AND type=1')
    .run(JSON.stringify({ ...profile, name: 'Changed fictional label' }));
  try {
    const again = await downloadReportCopy(actor, generated.id);
    assert.deepEqual(again.buffer, generated.buffer);
    assert.equal(again.filename, generated.filename);
    assert.equal(again.expiresAt, generated.expiresAt);
    assert.notEqual(again.attemptId, generated.attemptId);
    const book = new ExcelJS.Workbook();
    await book.xlsx.load(again.buffer as any);
    assert.equal(book.worksheets.length, 3);
    assert.notEqual(book.worksheets[0].getCell('A2').value, 'Changed fictional label');
    assert.equal(receipt(generated.id).delivery.requests, 2);
    assert.equal(receipt(generated.id).delivery.browserReceipts, 0);
    const first = await acknowledgeReport(actor, generated.id, {
      attemptId: again.attemptId,
      bytes: again.buffer.length,
    });
    assert.deepEqual(
      await acknowledgeReport(actor, generated.id, {
        attemptId: again.attemptId,
        bytes: again.buffer.length,
      }),
      first,
    );
    assert.equal(receipt(generated.id).delivery.browserReceipts, 1);
    assert.equal(reportDigest(again.buffer), reportDigest(generated.buffer));
  } finally {
    store.db
      .prepare('UPDATE preview_centers SET profile=? WHERE id=101 AND type=1')
      .run(String(row.profile));
  }
});
test('report copies remain owner/mode scoped even against another administrator and recheck stored grants', async () => {
  const generated = await generateReportExport(actor, {
    ...request,
    centers: [{ id: 104, type: 3 }],
  });
  await assert.rejects(() => downloadReportCopy(admin, generated.id), { code: 'REPORT_NOT_FOUND' });
  await assert.rejects(() => downloadReportCopy({ ...actor, mode: 'legacy' }, generated.id), {
    code: 'REPORT_NOT_FOUND',
  });
  await assert.rejects(
    () =>
      acknowledgeReport(admin, generated.id, {
        attemptId: generated.attemptId,
        bytes: generated.buffer.length,
      }),
    { code: 'REPORT_NOT_FOUND' },
  );
  const store = getStore();
  store.db
    .prepare(
      'DELETE FROM preview_report_grants WHERE dealer_id=? AND center_id=104 AND center_type=3',
    )
    .run(actor.dealerId);
  try {
    await assert.rejects(() => downloadReportCopy(actor, generated.id));
    await assert.rejects(() =>
      acknowledgeReport(actor, generated.id, {
        attemptId: generated.attemptId,
        bytes: generated.buffer.length,
      }),
    );
    assert.equal(receipt(generated.id).copy.canDownload, false);
    assert.ok(
      store.db.prepare('SELECT data FROM report_copies WHERE export_id=?').get(generated.id)?.data,
    );
  } finally {
    store.db.prepare('INSERT INTO preview_report_grants VALUES(?,104,3)').run(actor.dealerId);
  }
  store.db.prepare('UPDATE preview_dealers SET active=0 WHERE id=?').run(actor.dealerId);
  try {
    await assert.rejects(() => downloadReportCopy(actor, generated.id));
    assert.throws(() => reportHistoryPage(actor));
  } finally {
    store.db.prepare('UPDATE preview_dealers SET active=1 WHERE id=?').run(actor.dealerId);
  }
});
test('expiry removes only expired copy bytes, corruption fails closed and expired receipts cannot be fabricated', async () => {
  const expired = await generateReportExport(actor, request),
    active = await generateReportExport(actor, request),
    store = getStore();
  store.db.prepare('UPDATE report_copies SET expires_at=0 WHERE export_id=?').run(expired.id);
  await assert.rejects(() => downloadReportCopy(actor, expired.id), {
    code: 'REPORT_COPY_UNAVAILABLE',
  });
  assert.equal(receipt(expired.id).copy.state, 'expired');
  assert.equal(
    store.db.prepare('SELECT data FROM report_copies WHERE export_id=?').get(expired.id)?.data,
    null,
  );
  assert.deepEqual((await downloadReportCopy(actor, active.id)).buffer, active.buffer);
  const damaged = Buffer.from(active.buffer);
  damaged[0] ^= 1;
  store.db.prepare('UPDATE report_copies SET data=? WHERE export_id=?').run(damaged, active.id);
  await assert.rejects(() => downloadReportCopy(actor, active.id), { code: 'REPORT_COPY_INVALID' });
  store.db
    .prepare('UPDATE report_deliveries SET requested_at=? WHERE id=?')
    .run(Date.now() - REPORT_ACK_TTL - 1, active.attemptId);
  await assert.rejects(
    () =>
      acknowledgeReport(actor, active.id, {
        attemptId: active.attemptId,
        bytes: active.buffer.length,
      }),
    { code: 'REPORT_RECEIPT_EXPIRED' },
  );
  assert.equal(receipt(active.id).delivery.browserReceipts, 0);
});
test('browser receipts bind export/attempt/size, remain idempotent and are retained separately from generations', async () => {
  const first = await generateReportExport(actor, request),
    second = await generateReportExport(actor, request);
  await assert.rejects(
    () =>
      acknowledgeReport(actor, second.id, {
        attemptId: first.attemptId,
        bytes: first.buffer.length,
      }),
    { code: 'REPORT_NOT_FOUND' },
  );
  await assert.rejects(
    () => acknowledgeReport(actor, first.id, { attemptId: first.attemptId, bytes: 1 }),
    { code: 'REPORT_BYTES_MISMATCH' },
  );
  await acknowledgeReport(actor, first.id, {
    attemptId: first.attemptId,
    bytes: first.buffer.length,
  });
  assert.equal(receipt(first.id).delivery.browserReceipts, 1);
  getStore()
    .db.prepare('UPDATE report_deliveries SET requested_at=? WHERE id=?')
    .run(Date.now() - REPORT_DELIVERY_TTL - 1, first.attemptId);
  assert.equal(receipt(first.id).delivery.requests, 0);
  assert.equal(receipt(first.id).state, 'generated');
  assert.equal(receipt(first.id).copy.state, 'available');
});
test('publication failure rolls back copies and delivery attempts; a new preparation can recover', async () => {
  const store = getStore();
  store.db.exec(
    "CREATE TRIGGER fail_report_delivery BEFORE INSERT ON report_deliveries BEGIN SELECT RAISE(ABORT,'fixture'); END;",
  );
  let failedId = '';
  try {
    await assert.rejects(() => generateReportExport(actor, request));
    failedId = reportHistoryPage(actor).items[0].id;
    assert.equal(receipt(failedId).state, 'failed');
    assert.equal(receipt(failedId).copy.state, 'not-retained');
  } finally {
    store.db.exec('DROP TRIGGER fail_report_delivery');
  }
  assert.equal(
    store.db.prepare('SELECT COUNT(*) n FROM report_copies WHERE export_id=?').get(failedId)?.n,
    0,
  );
  assert.equal(
    store.db.prepare('SELECT COUNT(*) n FROM report_deliveries WHERE export_id=?').get(failedId)?.n,
    0,
  );
  assert.equal((await generateReportExport(actor, request)).retained, true);
});
test('large non-retained copies and legacy/unconfirmed history keep original requests and bounded pagination', () => {
  const store = getStore(),
    id = randomUUID();
  store.db
    .prepare('INSERT INTO report_exports VALUES(?,?,?,?,?,?,?,?)')
    .run(
      id,
      actor.dealerId,
      actor.mode,
      JSON.stringify(request),
      'generated',
      Date.now(),
      Date.now(),
      `icare-activity-2024-03-${id.slice(0, 8)}.xlsx`,
    );
  const plan = store.transaction(() =>
    retainReportCopy(actor, id, Buffer.alloc(REPORT_COPY_MAX_BYTES + 1)),
  );
  assert.equal(plan.retained, false);
  assert.equal(receipt(id).copy.state, 'size');
  assert.equal(
    store.db.prepare('SELECT data FROM report_copies WHERE export_id=?').get(id)?.data,
    null,
  );
  const pendingId = randomUUID();
  store.db
    .prepare('INSERT INTO report_exports VALUES(?,?,?,?,?,?,NULL,NULL)')
    .run(
      pendingId,
      actor.dealerId,
      actor.mode,
      JSON.stringify(request),
      'preparing',
      Date.now() - 20 * 60000,
    );
  for (let i = 0; i < 25; i++)
    store.db
      .prepare('INSERT INTO report_exports VALUES(?,?,?,?,?,?,NULL,NULL)')
      .run(
        randomUUID(),
        actor.dealerId,
        actor.mode,
        JSON.stringify(request),
        'generated',
        Date.now() - 30 * 60000 - i,
      );
  const first = reportHistoryPage(actor),
    second = reportHistoryPage(actor, { page: 2 });
  assert.equal(first.items.length, 20);
  assert.ok(second.items.length > 0);
  assert.equal(first.total, second.total);
  const all = [...first.items, ...second.items];
  assert.equal(all.find((r) => r.id === pendingId)?.state, 'unconfirmed');
  assert.equal(
    store.db.prepare('SELECT state FROM report_exports WHERE id=?').get(pendingId)?.state,
    'preparing',
  );
  assert.ok(all.some((r) => r.state === 'generated' && r.copy.state === 'not-retained'));
  assert.equal(reportHistoryPage(actor, { page: 100000 }).total, first.total);
  assert.equal(reportHistoryPage(actor, { page: 100000 }).items.length, 0);
});
test('School snapshots keep academic-year separation and download throttles bound repeated delivery', async () => {
  const generated = await generateReportExport(admin, {
    period: '2024-03',
    centers: [{ id: 102, type: 4 }],
    includeDeleted: false,
    academicYearId: 2026,
  });
  assert.equal(reportHistoryPage(admin).items[0].request.academicYearId, 2026);
  assert.deepEqual((await downloadReportCopy(admin, generated.id)).buffer, generated.buffer);
  for (let i = 0; i < 28; i++) await downloadReportCopy(admin, generated.id);
  await assert.rejects(() => downloadReportCopy(admin, generated.id), {
    code: 'REPORT_DOWNLOAD_LIMIT',
  });
});

test('actual report retention evicts the oldest own copy while preserving other actors and modes', async () => {
  const store = getStore(),
    now = Date.now();
  store.db
    .prepare('INSERT INTO preview_dealers VALUES(?,?,?,?,1,0,?)')
    .run(
      900003,
      'Fictional export fixture',
      'export.fixture',
      'fixture@example.test',
      '2026-10-30',
    );
  store.db.prepare('INSERT INTO preview_dealer_centers VALUES(900003,101,1)').run();
  const owner: PortalActor = { ...actor, subject: 'preview:900003', dealerId: 900003 };
  function seed(dealer: number, mode: string, time: number) {
    const id = randomUUID(),
      data = Buffer.from('fictional retained bytes');
    store.db
      .prepare('INSERT INTO report_exports VALUES(?,?,?,?,?,?,?,?)')
      .run(
        id,
        dealer,
        mode,
        JSON.stringify(request),
        'generated',
        time,
        time,
        `icare-activity-2024-03-${id.slice(0, 8)}.xlsx`,
      );
    store.db
      .prepare('INSERT INTO report_copies VALUES(?,?,?,?,?,?,?,?,?)')
      .run(
        id,
        dealer,
        mode,
        data,
        data.length,
        reportDigest(data),
        'available',
        time,
        now + 86400000,
      );
    return id;
  }
  const copies = Array.from({ length: 20 }, (_, i) =>
    seed(owner.dealerId, 'preview', now - 30000 + i),
  );
  const otherActor = seed(admin.dealerId, 'preview', now - 60000),
    otherMode = seed(owner.dealerId, 'legacy', now - 60000);
  assert.equal((await generateReportExport(owner, request)).retained, true);
  assert.equal(
    store.db.prepare('SELECT state FROM report_copies WHERE export_id=?').get(copies[0])?.state,
    'evicted',
  );
  for (const id of [otherActor, otherMode, copies[1]])
    assert.ok(store.db.prepare('SELECT data FROM report_copies WHERE export_id=?').get(id)?.data);
});

test('only two workbook preparations run concurrently and capacity is released after completion', async () => {
  const first = generateReportExport(actor, request),
    second = generateReportExport(actor, request);
  await assert.rejects(() => generateReportExport(actor, request), { code: 'EXPORT_BUSY' });
  const ready = await Promise.all([first, second]);
  assert.ok(ready.every((result) => result.retained));
  assert.equal((await generateReportExport(actor, request)).retained, true);
});
