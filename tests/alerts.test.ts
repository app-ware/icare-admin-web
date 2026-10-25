import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { centerGrants, hasPermission, type PortalActor } from '../src/domain/access';
import {
  alertBatchSchema,
  alertQuerySchema,
  alertState,
  calendarDate,
  utcToday,
  type AlertBatchInput,
} from '../src/domain/alerts';
import { getStore } from '../src/server/store';
import {
  getAlert,
  getAlertBatch,
  listAlerts,
  retryAlertBatch,
  submitAlertBatch,
} from '../src/server/alerts/repository';

test('alert contracts bound recipients and plain text, retain inclusive UTC dates, and separate invalid records', () => {
  assert.equal(alertState('Message', '2026-10-25', 1, '2026-10-25'), 'current');
  assert.equal(alertState('Message', '2026-10-24', 1, '2026-10-25'), 'expired');
  assert.equal(alertState(null, null, 0, '2026-10-25'), 'none');
  for (const [message, date, count] of [
    [null, '2026-10-25', 1],
    ['', '2026-10-25', 1],
    ['Message', '2026-02-30', 1],
    ['Message', '2026-10-25', 2],
  ] as const)
    assert.equal(alertState(message, date, count, '2026-10-25'), 'review');
  assert.ok(calendarDate.safeParse('2028-02-29').success);
  assert.equal(calendarDate.safeParse('2026-02-29').success, false);
  const target = { id: 101, type: 1, revision: 'a'.repeat(64) };
  const valid = {
    id: randomUUID(),
    action: 'publish',
    targets: [target],
    message: 'Clear communication',
    expiryDate: '2099-01-01',
  };
  assert.ok(alertBatchSchema.safeParse(valid).success);
  for (const changes of [
    { targets: [] },
    { targets: [target, target] },
    { targets: Array.from({ length: 11 }, (_, i) => ({ ...target, id: i + 1 })) },
    { message: ' ' },
    { message: 'x'.repeat(251) },
    { message: '<b>HTML</b>' },
    { message: 'hello\u0000' },
    { expiryDate: 'tomorrow' },
    { expiryDate: '2026-02-30' },
    { actorId: 1 },
  ])
    assert.equal(alertBatchSchema.safeParse({ ...valid, ...changes }).success, false);
  assert.equal(alertBatchSchema.safeParse({ ...valid, action: 'reset' }).success, false);
  assert.equal(alertQuerySchema.safeParse({ sql: 'arbitrary' }).success, false);
});
test('page-8 grants allow reads only; publishing follows ownership and reset stays administrator-only', () => {
  const actor: PortalActor = {
    subject: 'preview:900002',
    dealerId: 900002,
    name: 'Operator',
    username: 'demo.dealer',
    mode: 'preview',
    isSuperAdmin: false,
    active: true,
    expiresAt: Date.now() + 60000,
    sessionId: 'unit',
    grants: centerGrants(false, ['101_1'], ['105_1'], ['106_1'], ['104_3', '102_4']),
  };
  for (const ref of [
    { id: 104, type: 3 },
    { id: 102, type: 4 },
  ] as const) {
    assert.ok(hasPermission(actor, 'alerts.read', ref));
    for (const permission of [
      'alerts.write',
      'alerts.reset',
      'centers.read',
      'reports.read',
      'status.read',
    ] as const)
      assert.equal(hasPermission(actor, permission, ref), false);
  }
  assert.ok(hasPermission(actor, 'alerts.write', { id: 101, type: 1 }));
  assert.equal(hasPermission(actor, 'alerts.reset', { id: 101, type: 1 }), false);
  assert.equal(hasPermission(actor, 'alerts.read', { id: 101, type: 4 }), false);
  assert.equal(
    hasPermission({ ...actor, expiresAt: 0 }, 'alerts.write', { id: 101, type: 1 }),
    false,
  );
});
test('owned batches are idempotent, atomic per center, retry only failed targets and protect expiry/scope', async () => {
  process.env.ICARE_STORAGE_PATH = ':memory:';
  process.env.ICARE_LIVE_DATA_ENABLED = 'false';
  const store = getStore();
  const admin: PortalActor = {
    subject: 'preview:900001',
    dealerId: 900001,
    name: 'Admin',
    username: 'demo.admin',
    mode: 'preview',
    isSuperAdmin: true,
    active: true,
    expiresAt: Date.now() + 60000,
    sessionId: 'unit',
    grants: centerGrants(true, []),
  };
  const operator: PortalActor = {
    ...admin,
    subject: 'preview:900002',
    dealerId: 900002,
    name: 'Operator',
    isSuperAdmin: false,
    grants: centerGrants(false, ['101_1', '103_1'], [], [], ['104_3']),
  };
  const make = async (
    actor: PortalActor,
    refs: { id: number; type: 1 | 3 | 4 }[],
    message = 'Acceptance message',
  ): Promise<AlertBatchInput> => ({
    id: randomUUID(),
    action: 'publish',
    message,
    expiryDate: '2099-01-01',
    targets: await Promise.all(
      refs.map(async (ref) => ({ ...ref, revision: (await getAlert(actor, ref)).revision })),
    ),
  });
  try {
    assert.deepEqual(
      (await listAlerts(operator, alertQuerySchema.parse({}))).items.map((c) => c.id).sort(),
      [101, 103, 104],
    );
    assert.equal((await getAlert(operator, { id: 104, type: 3 })).canPublish, false);
    await assert.rejects(() => getAlert(operator, { id: 101, type: 4 }), /Access denied/);
    await assert.rejects(
      () => listAlerts(operator, alertQuerySchema.parse({ dealerId: 900001 })),
      /Access denied/,
    );
    const input = await make(admin, [
      { id: 101, type: 1 },
      { id: 102, type: 4 },
    ]);
    let result = await submitAlertBatch(admin, input);
    assert.ok(result.targets.every((t) => t.state === 'succeeded' && t.attempts === 1));
    const saved = await getAlert(admin, { id: 101, type: 1 });
    assert.equal(saved.message, 'Acceptance message');
    assert.equal((await submitAlertBatch(admin, input)).targets[0].attempts, 1);
    assert.equal((await getAlert(admin, { id: 101, type: 1 })).revision, saved.revision);
    await assert.rejects(
      () =>
        submitAlertBatch(admin, {
          ...input,
          action: 'publish',
          message: 'Changed payload',
          expiryDate: '2099-01-01',
        }),
      (e: any) => e.code === 'BATCH_ID_CONFLICT',
    );
    await assert.rejects(
      () => getAlertBatch(operator, input.id),
      (e: any) => e.code === 'BATCH_NOT_FOUND',
    );
    await assert.rejects(
      () => getAlertBatch({ ...admin, mode: 'legacy' }, input.id),
      (e: any) => e.code === 'BATCH_NOT_FOUND',
    );
    const stale = await submitAlertBatch(admin, {
      ...input,
      id: randomUUID(),
      action: 'publish',
      message: 'Stale update',
      expiryDate: '2099-01-01',
    });
    assert.ok(
      stale.targets.every(
        (t) => t.state === 'failed' && t.code === 'REVISION_CONFLICT' && !t.retryable,
      ),
    );
    assert.ok((await retryAlertBatch(admin, stale.id)).targets.every((t) => t.attempts === 1));
    const readOnly = await getAlert(operator, { id: 104, type: 3 });
    result = await submitAlertBatch(operator, {
      id: randomUUID(),
      action: 'publish',
      message: 'Scoped message',
      expiryDate: '2099-01-01',
      targets: [{ id: 104, type: 3, revision: readOnly.revision }],
    });
    assert.equal(result.targets[0].code, 'ACCESS_DENIED');
    await assert.rejects(
      () =>
        submitAlertBatch(operator, { id: randomUUID(), action: 'reset', targets: input.targets }),
      /Access denied/,
    );
    const forged = { ...operator, isSuperAdmin: true, grants: centerGrants(true, []) };
    const forgedResult = await submitAlertBatch(forged, {
      id: randomUUID(),
      action: 'reset',
      targets: [{ id: 101, type: 1, revision: saved.revision }],
    });
    assert.equal(forgedResult.targets[0].code, 'ACCESS_DENIED');
    store.db.exec(
      "CREATE TEMP TRIGGER fail_one_alert BEFORE INSERT ON preview_alerts WHEN NEW.center_id=103 BEGIN SELECT RAISE(ABORT,'fixture'); END;",
    );
    const mixed = await make(
      admin,
      [
        { id: 101, type: 1 },
        { id: 103, type: 1 },
      ],
      'Retry acceptance',
    );
    try {
      result = await submitAlertBatch(admin, mixed);
    } finally {
      store.db.exec('DROP TRIGGER fail_one_alert');
    }
    assert.equal(result.targets.find((t) => t.id === 101)!.state, 'succeeded');
    assert.equal(result.targets.find((t) => t.id === 103)!.retryable, true);
    const once = (await getAlert(admin, { id: 101, type: 1 })).revision;
    result = await retryAlertBatch(admin, mixed.id);
    assert.equal(result.targets.find((t) => t.id === 101)!.attempts, 1);
    assert.equal(result.targets.find((t) => t.id === 103)!.attempts, 2);
    assert.equal((await getAlert(admin, { id: 101, type: 1 })).revision, once);
    const toReset = await getAlert(admin, { id: 101, type: 1 });
    const reset: AlertBatchInput = {
      id: randomUUID(),
      action: 'reset',
      targets: [{ id: 101, type: 1, revision: toReset.revision }],
    };
    assert.equal((await submitAlertBatch(admin, reset)).targets[0].state, 'succeeded');
    const none = await getAlert(admin, { id: 101, type: 1 });
    assert.equal(none.state, 'none');
    assert.notEqual(none.revision, input.targets[0].revision);
    const interrupted = await make(admin, [{ id: 103, type: 1 }], 'Interrupted fixture');
    await submitAlertBatch(admin, interrupted);
    store.db
      .prepare("UPDATE alert_batch_targets SET state='working',attempts=1 WHERE batch_id=?")
      .run(interrupted.id);
    store.db
      .prepare('UPDATE alert_batches SET lease_until=? WHERE id=?')
      .run(Date.now() + 60000, interrupted.id);
    assert.equal((await getAlertBatch(admin, interrupted.id)).running, true);
    await assert.rejects(
      () => retryAlertBatch(admin, interrupted.id),
      (e: any) => e.code === 'BATCH_RUNNING',
    );
    store.db
      .prepare('UPDATE alert_batches SET lease_until=? WHERE id=?')
      .run(Date.now() - 1, interrupted.id);
    assert.equal((await getAlertBatch(admin, interrupted.id)).targets[0].state, 'unconfirmed');
    assert.equal((await retryAlertBatch(admin, interrupted.id)).targets[0].attempts, 1);
    const beforeFailure = await getAlert(admin, { id: 103, type: 1 });
    store.db.exec(
      "CREATE TEMP TRIGGER fail_alert_receipt BEFORE UPDATE ON alert_batch_targets WHEN NEW.state='succeeded' BEGIN SELECT RAISE(ABORT,'fixture'); END;",
    );
    try {
      result = await submitAlertBatch(
        admin,
        await make(admin, [{ id: 103, type: 1 }], 'Atomic failure'),
      );
    } finally {
      store.db.exec('DROP TRIGGER fail_alert_receipt');
    }
    assert.equal(result.targets[0].state, 'failed');
    assert.equal((await getAlert(admin, { id: 103, type: 1 })).revision, beforeFailure.revision);
    const past = { ...(await make(admin, [{ id: 103, type: 1 }])), expiryDate: '2000-01-01' };
    await assert.rejects(
      () => submitAlertBatch(admin, past),
      (e: any) => e.code === 'EXPIRY_IN_PAST',
    );
    const today = await make(admin, [{ id: 103, type: 1 }], 'Inclusive today');
    if (today.action === 'publish') today.expiryDate = utcToday();
    assert.equal((await submitAlertBatch(admin, today)).targets[0].state, 'succeeded');
    assert.equal((await getAlert(admin, { id: 103, type: 1 })).state, 'current');
    store.db.prepare('UPDATE alert_batches SET expires_at=0 WHERE id=?').run(input.id);
    await assert.rejects(
      () => getAlertBatch(admin, input.id),
      (e: any) => e.code === 'BATCH_EXPIRED',
    );
    store.db.prepare('UPDATE preview_dealers SET active=0 WHERE id=900002').run();
    await assert.rejects(() => getAlert(operator, { id: 101, type: 1 }), /Access denied/);
    await assert.rejects(
      () => submitAlertBatch({ ...admin, mode: 'legacy' }, input),
      (e: any) => e.code === 'ALERT_WRITES_DISABLED',
    );
  } finally {
    store.close();
  }
});
