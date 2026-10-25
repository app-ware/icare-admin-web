import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  assertCapability,
  centerGrants,
  hasPermission,
  type PortalActor,
} from '../src/domain/access';
import {
  statusChangeSchema,
  statusQuerySchema,
  statusRefSchema,
  statusState,
} from '../src/domain/status';
import { getStore } from '../src/server/store';
import { changeStatus, getStatus, listStatuses } from '../src/server/status/repository';

test('status contracts preserve unknown/ambiguous records and reject invalid targets and unbounded input', () => {
  assert.equal(statusState(null, 0), 'unknown');
  assert.equal(statusState(null, 1), 'review');
  assert.equal(statusState(1, 2), 'review');
  assert.equal(statusState(7, 1), 'review');
  assert.equal(statusState(0, 1), 'inactive');
  assert.equal(statusState(1, 1), 'active');
  const valid = { active: false, reason: 'Scheduled maintenance', revision: 'a'.repeat(64) };
  assert.ok(statusChangeSchema.safeParse(valid).success);
  for (const change of [
    { actorId: 1 },
    { reason: '   ' },
    { reason: 'x'.repeat(501) },
    { active: 0 },
    { revision: 'old' },
    { reason: 'bad\u0000reason' },
  ])
    assert.equal(statusChangeSchema.safeParse({ ...valid, ...change }).success, false);
  for (const ref of [
    { id: 0, type: 1 },
    { id: 1, type: 2 },
    { id: 2147483648, type: 1 },
  ])
    assert.equal(statusRefSchema.safeParse(ref).success, false);
  assert.equal(statusQuerySchema.safeParse({ dealerId: -1 }).success, false);
  assert.equal(statusQuerySchema.safeParse({ page: 100001 }).success, false);
  assert.equal(statusQuerySchema.safeParse({ sql: 'anything' }).success, false);
});
test('page-9 scope adds only status reads and never broadens profile, report or write access', () => {
  const actor: PortalActor = {
    subject: 'preview:900002',
    dealerId: 900002,
    name: 'Operator',
    username: 'demo.dealer',
    isSuperAdmin: false,
    mode: 'preview',
    active: true,
    expiresAt: Date.now() + 60000,
    grants: centerGrants(false, ['101_1'], ['105_1'], ['104_3', '102_4']),
    sessionId: 'unit',
  };
  assert.equal(hasPermission(actor, 'status.read', { id: 104, type: 3 }), true);
  assert.equal(hasPermission(actor, 'status.read', { id: 102, type: 4 }), true);
  for (const permission of [
    'status.manage',
    'centers.read',
    'centers.write',
    'reports.read',
  ] as const)
    assert.equal(hasPermission(actor, permission, { id: 104, type: 3 }), false);
  assert.equal(hasPermission(actor, 'status.read', { id: 105, type: 1 }), false);
  assert.equal(hasPermission(actor, 'status.read', { id: 101, type: 4 }), false);
  assert.throws(() => assertCapability({ ...actor, expiresAt: 0 }, 'status.read'));
  assert.throws(() => assertCapability({ ...actor, grants: [] }, 'status.read'));
});
test('demo status changes recheck stored scope, preserve profiles, reject stale retries and atomically record bounded history', async () => {
  process.env.ICARE_STORAGE_PATH = ':memory:';
  process.env.ICARE_LIVE_DATA_ENABLED = 'false';
  const store = getStore();
  const operator: PortalActor = {
    subject: 'preview:900002',
    dealerId: 900002,
    name: 'Operator',
    username: 'demo.dealer',
    isSuperAdmin: false,
    mode: 'preview',
    active: true,
    expiresAt: Date.now() + 60000,
    grants: centerGrants(false, ['101_1', '103_1'], ['104_3'], ['104_3']),
    sessionId: 'unit',
  };
  const admin: PortalActor = {
    ...operator,
    subject: 'preview:900001',
    dealerId: 900001,
    name: 'Admin',
    isSuperAdmin: true,
    grants: centerGrants(true, []),
  };
  const ref = { id: 101, type: 1 as const };
  const update = (revision: string, active: boolean) => ({
    revision,
    active,
    reason: 'Scheduled maintenance',
  });
  try {
    const list = await listStatuses(operator, statusQuerySchema.parse({}));
    assert.deepEqual(list.items.map((c) => c.id).sort(), [101, 103, 104]);
    const readOnly = await getStatus(operator, { id: 104, type: 3 });
    assert.equal(readOnly.center.canManage, false);
    await assert.rejects(
      () => changeStatus(operator, { id: 104, type: 3 }, update(readOnly.center.revision, false)),
      /Access denied/,
    );
    await assert.rejects(() => getStatus(operator, { id: 101, type: 4 }), /Access denied/);
    await assert.rejects(
      () =>
        getStatus(
          { ...operator, isSuperAdmin: true, grants: centerGrants(true, []) },
          { id: 102, type: 4 },
        ),
      /Access denied/,
    );
    await assert.rejects(
      () => listStatuses(operator, statusQuerySchema.parse({ dealerId: 900001 })),
      /Access denied/,
    );
    const current = await getStatus(operator, ref);
    const originalProfile = store.db
      .prepare('SELECT profile FROM preview_centers WHERE id=101 AND type=1')
      .get()!.profile;
    const first = await changeStatus(operator, ref, update(current.center.revision, false));
    assert.equal(first.center.state, 'inactive');
    assert.equal(first.historyRecorded, true);
    assert.equal(first.history[0].actor, 'Operator');
    assert.equal(first.history[0].state, 'committed');
    assert.equal(first.history[0].reason, 'Scheduled maintenance');
    assert.equal(
      store.db.prepare('SELECT profile FROM preview_centers WHERE id=101 AND type=1').get()!
        .profile,
      originalProfile,
    );
    await assert.rejects(
      () => changeStatus(operator, ref, update(current.center.revision, false)),
      (e: any) => e.code === 'REVISION_CONFLICT',
    );
    const restored = await changeStatus(operator, ref, update(first.center.revision, true));
    assert.notEqual(restored.center.revision, current.center.revision);
    await assert.rejects(
      () => changeStatus(operator, ref, update(current.center.revision, false)),
      (e: any) => e.code === 'REVISION_CONFLICT',
    );
    await assert.rejects(
      () => changeStatus(operator, ref, update(restored.center.revision, true)),
      (e: any) => e.code === 'STATUS_UNCHANGED',
    );
    store.db.exec(
      "CREATE TRIGGER reject_status_receipt BEFORE INSERT ON center_status_operations BEGIN SELECT RAISE(ABORT,'fixture'); END;",
    );
    await assert.rejects(() =>
      changeStatus(operator, ref, update(restored.center.revision, false)),
    );
    assert.equal((await getStatus(operator, ref)).center.state, 'active');
    store.db.exec('DROP TRIGGER reject_status_receipt');
    store.db.prepare('UPDATE preview_centers SET active=NULL WHERE id=102 AND type=4').run();
    const unknown = await getStatus(admin, { id: 102, type: 4 });
    assert.equal(unknown.center.state, 'unknown');
    const explicit = await changeStatus(
      admin,
      { id: 102, type: 4 },
      update(unknown.center.revision, true),
    );
    assert.equal(explicit.history[0].previousCode, null);
    assert.equal(explicit.center.state, 'active');
    assert.equal((await getStatus(operator, ref)).history.length, 2);
    let latest = (await getStatus(operator, ref)).center;
    for (let i = 0; i < 21; i++)
      latest = (await changeStatus(operator, ref, update(latest.revision, latest.code !== 1)))
        .center;
    assert.equal((await getStatus(operator, ref)).history.length, 20);
    assert.equal((await getStatus(admin, { id: 102, type: 4 })).history.length, 1);
    store.db.prepare("UPDATE center_status_operations SET mode='legacy' WHERE center_id=101").run();
    assert.equal((await getStatus(operator, ref)).history.length, 0);
    store.db.prepare('DELETE FROM preview_status_grants WHERE dealer_id=900002').run();
    await assert.rejects(() => getStatus(operator, { id: 104, type: 3 }), /Access denied/);
    store.db.prepare('UPDATE preview_dealers SET active=0 WHERE id=900002').run();
    await assert.rejects(
      () => changeStatus(operator, ref, update(restored.center.revision, false)),
      /Access denied/,
    );
    const noWriteLive = { ...admin, mode: 'legacy' as const };
    await assert.rejects(
      () => changeStatus(noWriteLive, ref, update(restored.center.revision, false)),
      (e: any) => e.code === 'STATUS_WRITES_DISABLED',
    );
    await assert.rejects(() => getStatus({ ...admin, expiresAt: 0 }, ref), /Access denied/);
  } finally {
    store.close();
  }
});
