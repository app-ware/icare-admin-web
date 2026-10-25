import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centerGrants, hasPermission, type PortalActor } from '../src/domain/access';
import {
  busChangeSchema,
  busIdSchema,
  referencesValid,
  resolveBusSettings,
  transportQuerySchema,
  type BusReferences,
} from '../src/domain/transport';
import { getStore } from '../src/server/store';
import {
  changeBus,
  getBus,
  listBuses,
  listTransportCenters,
} from '../src/server/transport/repository';

const refs: BusReferences = {
  radius: [{ id: 7, label: '100 metres', value: 100 }],
  dwell: [{ id: 9, label: '60 seconds', value: 60 }],
  input: [{ id: 2, label: 'Manual', value: null }],
};
test('bus inheritance preserves lookup IDs, rejects ambiguous rows and never invents references', () => {
  const row = { id: 1, busId: -1, radius: 7, dwell: 9, input: 2 };
  assert.equal(resolveBusSettings([row], 42, refs).source, 'inherited');
  assert.equal(resolveBusSettings([], 42, refs).source, 'missing');
  assert.deepEqual(resolveBusSettings([row], 42, refs).values, { radius: 7, dwell: 9, input: 2 });
  assert.equal(
    resolveBusSettings([row, { ...row, id: 2, busId: 42, radius: 100 }], 42, refs).issues.length,
    1,
  );
  assert.equal(resolveBusSettings([row, { ...row, id: 2 }], 42, refs).issues.length, 1);
  assert.equal(
    resolveBusSettings([row, { ...row, id: 2, busId: 42 }, { ...row, id: 3, busId: 42 }], 42, refs)
      .issues.length,
    1,
  );
  assert.equal(resolveBusSettings([{ ...row, dwell: null }], 42, refs).issues.length, 1);
  for (const invalid of [
    { ...refs, input: [] },
    { ...refs, input: [...refs.input, ...refs.input] },
    { ...refs, radius: [{ id: 7, label: '', value: 100 }] },
    { ...refs, dwell: [{ id: 9, label: 'Unknown', value: null }] },
  ])
    assert.equal(referencesValid(invalid), false);
});
test('transport validation and grants reject defaults, extra request fields and page-only scope', () => {
  const valid = { action: 'override', revision: 'a'.repeat(64), radius: 7, dwell: 9, input: 2 };
  assert.ok(busChangeSchema.safeParse(valid).success);
  for (const change of [
    { radius: -1 },
    { input: 0 },
    { dwell: 1.5 },
    { actorId: 1 },
    { revision: 'old' },
    { centerType: 4 },
  ])
    assert.equal(busChangeSchema.safeParse({ ...valid, ...change }).success, false);
  assert.equal(
    busChangeSchema.safeParse({ action: 'inherit', revision: valid.revision, radius: 7 }).success,
    false,
  );
  assert.equal(busIdSchema.safeParse(-1).success, false);
  assert.equal(transportQuerySchema.safeParse({ database: 'school' }).success, false);
  const actor: PortalActor = {
    subject: 'test',
    dealerId: 900002,
    active: true,
    expiresAt: Date.now() + 60000,
    grants: centerGrants(false, ['101_1'], ['104_3'], ['104_3'], ['104_3']),
    mode: 'preview',
    name: 'Operator',
    username: 'test',
    isSuperAdmin: false,
    sessionId: 'test',
  };
  assert.equal(hasPermission(actor, 'transport.manage', { id: 101, type: 1 }), true);
  for (const ref of [
    { id: 101, type: 4 as const },
    { id: 104, type: 3 as const },
  ])
    assert.equal(hasPermission(actor, 'transport.manage', ref), false);
});
test('demo bus overrides persist, return to defaults, reject stale ABA, and recheck stored ownership', async () => {
  process.env.ICARE_STORAGE_PATH = ':memory:';
  process.env.ICARE_LIVE_DATA_ENABLED = 'false';
  const store = getStore();
  const actor: PortalActor = {
    subject: 'preview:900002',
    dealerId: 900002,
    active: true,
    expiresAt: Date.now() + 60000,
    grants: centerGrants(false, ['101_1', '103_1']),
    mode: 'preview',
    name: 'Operator',
    username: 'demo.dealer',
    isSuperAdmin: false,
    sessionId: 'test',
  };
  const admin: PortalActor = {
    ...actor,
    dealerId: 900001,
    subject: 'preview:900001',
    isSuperAdmin: true,
    grants: centerGrants(true, []),
  };
  const ref = { id: 101, type: 1 as const };
  assert.equal((await listTransportCenters(actor, transportQuerySchema.parse({}))).items.length, 2);
  assert.equal((await listBuses(actor, ref)).items.length, 2);
  const initial = await getBus(actor, ref, 1);
  assert.equal(initial.source, 'inherited');
  assert.equal(initial.canManage, true);
  await assert.rejects(
    () =>
      changeBus(actor, ref, 1, {
        action: 'override',
        revision: initial.revision,
        radius: 50,
        dwell: 1,
        input: 1,
      }),
    { code: 'INVALID_CHOICE' },
  );
  const saved = await changeBus(actor, ref, 1, {
    action: 'override',
    revision: initial.revision,
    radius: 2,
    dwell: 2,
    input: 2,
  });
  assert.equal(saved.source, 'override');
  assert.equal(saved.values?.radius, 2);
  assert.equal((await getBus(actor, ref, 2)).source, 'inherited');
  assert.equal((await getBus(actor, { id: 103, type: 1 }, 1)).source, 'inherited');
  await assert.rejects(
    () => changeBus(actor, ref, 1, { action: 'inherit', revision: initial.revision }),
    { code: 'REVISION_CONFLICT' },
  );
  const reset = await changeBus(actor, ref, 1, { action: 'inherit', revision: saved.revision });
  assert.equal(reset.source, 'inherited');
  assert.notEqual(reset.revision, initial.revision);
  await assert.rejects(
    () =>
      changeBus(actor, ref, 1, {
        action: 'override',
        revision: initial.revision,
        radius: 2,
        dwell: 2,
        input: 2,
      }),
    { code: 'REVISION_CONFLICT' },
  );
  // Receipt failure rolls the fictional save and revision back together.
  store.db.exec(
    "CREATE TRIGGER fail_bus_receipt BEFORE INSERT ON bus_operations BEGIN SELECT RAISE(ABORT,'receipt unavailable'); END",
  );
  await assert.rejects(() =>
    changeBus(actor, ref, 1, {
      action: 'override',
      revision: reset.revision,
      radius: 2,
      dwell: 2,
      input: 2,
    }),
  );
  store.db.exec('DROP TRIGGER fail_bus_receipt');
  assert.equal((await getBus(actor, ref, 1)).revision, reset.revision);
  const school = await getBus(admin, { id: 102, type: 4 }, 1);
  assert.equal(school.references.radius[0].value, 75);
  for (const a of [
    { ...actor, expiresAt: 0 },
    { ...actor, grants: [] },
    { ...actor, grants: centerGrants(true, []) },
  ]) {
    await assert.rejects(() => getBus(a, { id: 102, type: 4 }, 1));
  }
  await assert.rejects(() => getBus(actor, { id: 101, type: 4 }, 1));
  await assert.rejects(() => getBus(actor, ref, -1));
  store.db
    .prepare(
      'DELETE FROM preview_dealer_centers WHERE dealer_id=? AND center_id=? AND center_type=?',
    )
    .run(actor.dealerId, 101, 1);
  await assert.rejects(() => getBus(actor, ref, 1));
  await assert.rejects(() =>
    changeBus(actor, ref, 1, {
      action: 'override',
      revision: reset.revision,
      radius: 2,
      dwell: 2,
      input: 2,
    }),
  );
  assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM bus_operations').get()?.n, 2);
  await assert.rejects(
    () =>
      changeBus({ ...actor, mode: 'legacy' }, ref, 1, {
        action: 'override',
        revision: reset.revision,
        radius: 2,
        dwell: 2,
        input: 2,
      }),
    { code: 'WRITES_DISABLED' },
  );
});
