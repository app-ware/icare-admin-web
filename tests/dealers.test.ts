import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dealerCreateSchema,
  dealerUpdateSchema,
  dealerQuerySchema,
  assertDealerLifecycle,
  DealerPolicyError,
} from '../src/domain/dealers';
import { centerGrants, hasPermission, type PortalActor } from '../src/domain/access';
import {
  createDealer,
  updateDealer,
  getDealer,
  listDealers,
  dealerCenterOptions,
} from '../src/server/dealers/repository';
import { demoDealer } from '../src/server/auth/dealers';
import { getStore } from '../src/server/store';

const input = {
  name: 'Test operator',
  username: 'test.operator',
  email: 'operator@example.test',
  password: 'Fictional-Test-Only-123',
  active: true,
  isSuperAdmin: false,
  centers: [{ id: 101, type: 1 }],
};
test('dealer validation rejects escalation fields, weak credentials, duplicate center keys and unsupported center types', () => {
  assert.ok(dealerCreateSchema.safeParse(input).success);
  for (const changed of [
    { password: 'short' },
    { username: 'bad username' },
    { email: 'bad' },
    { actor: 1 },
    { centers: [{ id: 101, type: 2 }] },
    { centers: [{ id: 2147483648, type: 1 }] },
    {
      centers: [
        { id: 101, type: 1 },
        { id: 101, type: 1 },
      ],
    },
  ])
    assert.equal(dealerCreateSchema.safeParse({ ...input, ...changed }).success, false);
  const { username, password, ...update } = input;
  assert.equal(
    dealerUpdateSchema.safeParse({ ...update, revision: 'a'.repeat(64), username }).success,
    false,
  );
  assert.equal(
    dealerUpdateSchema.safeParse({ ...update, revision: 'a'.repeat(64), password }).success,
    false,
  );
});
test('dealer lifecycle preserves active administration and denies self lockout', () => {
  const admin = { id: 7, active: true, isSuperAdmin: true };
  for (const next of [
    { active: false, isSuperAdmin: true },
    { active: true, isSuperAdmin: false },
  ]) {
    assert.throws(
      () => assertDealerLifecycle(7, admin, next, 2),
      (e) => e instanceof DealerPolicyError && e.code === 'SELF_LOCKOUT',
    );
    assert.throws(
      () => assertDealerLifecycle(8, admin, next, 1),
      (e) => e instanceof DealerPolicyError && e.code === 'LAST_ADMIN',
    );
    assert.doesNotThrow(() => assertDealerLifecycle(8, admin, next, 2));
  }
  assert.doesNotThrow(() =>
    assertDealerLifecycle(
      8,
      { ...admin, isSuperAdmin: false },
      { active: false, isSuperAdmin: false },
      1,
    ),
  );
});
test('only administrator grants include dealer management', () => {
  const actor = { subject: 'verified', dealerId: 7, active: true, expiresAt: Date.now() + 60000 };
  assert.equal(
    hasPermission({ ...actor, grants: centerGrants(false, ['101_1']) }, 'dealers.manage'),
    false,
  );
  assert.equal(hasPermission({ ...actor, grants: centerGrants(true, []) }, 'dealers.manage'), true);
});
test('dealer service enforces stored administrator role, account conflicts, assignments, revocation and mode isolation', async () => {
  process.env.ICARE_STORAGE_PATH = ':memory:';
  process.env.ICARE_LIVE_DATA_ENABLED = 'false';
  const store = getStore();
  const actor: PortalActor = {
    subject: 'preview:900001',
    dealerId: 900001,
    name: 'Alex',
    username: 'demo.admin',
    isSuperAdmin: true,
    active: true,
    expiresAt: Date.now() + 60000,
    grants: centerGrants(true, []),
    mode: 'preview',
    sessionId: 'unit',
  };
  try {
    assert.equal((await listDealers(actor, dealerQuerySchema.parse({}))).total, 2);
    await assert.rejects(
      () => listDealers({ ...actor, dealerId: 900002 }, dealerQuerySchema.parse({})),
      /Access denied/,
    );
    await assert.rejects(
      () => createDealer({ ...actor, expiresAt: 0 }, dealerCreateSchema.parse(input)),
      /Access denied/,
    );
    const created = await createDealer(actor, dealerCreateSchema.parse(input));
    assert.equal(created.isSuperAdmin, false);
    assert.equal(created.centerCount, 1);
    assert.equal(JSON.stringify(created).includes(input.password), false);
    assert.equal(
      JSON.stringify(
        store.db.prepare('SELECT * FROM preview_dealers WHERE id=?').get(created.id),
      ).includes(input.password),
      false,
    );
    await assert.rejects(
      () => createDealer(actor, dealerCreateSchema.parse({ ...input, username: 'TEST.OPERATOR' })),
      (e) => (e as { code: string }).code === 'USERNAME_EXISTS',
    );
    assert.equal((await listDealers(actor, dealerQuerySchema.parse({ page: 99 }))).total, 3);
    const token = store.createSession(created.id, 'preview', 'stamp');
    const update = dealerUpdateSchema.parse({
      name: created.name,
      email: created.email,
      active: true,
      isSuperAdmin: false,
      centers: [{ id: 102, type: 4 }],
      revision: created.revision,
    });
    const saved = await updateDealer(actor, created.id, update);
    assert.equal(store.session(token.token), null);
    assert.deepEqual(
      saved.centers.map((c) => [c.id, c.type]),
      [[102, 4]],
    );
    await assert.rejects(
      () => updateDealer(actor, created.id, update),
      (e) => (e as { code: string }).code === 'REVISION_CONFLICT',
    );
    const inactive = await updateDealer(actor, created.id, {
      ...update,
      revision: saved.revision,
      active: false,
    });
    assert.equal(inactive.active, false);
    assert.equal(demoDealer(created.id), null);
    const promoted = await updateDealer(actor, created.id, {
      ...update,
      revision: inactive.revision,
      active: true,
      isSuperAdmin: true,
    });
    assert.equal(promoted.isSuperAdmin, true);
    assert.equal(demoDealer(created.id)?.isSuperAdmin, true);
    const self = await getDealer(actor, actor.dealerId);
    await assert.rejects(
      () =>
        updateDealer(actor, self.id, {
          name: self.name,
          email: self.email,
          active: false,
          isSuperAdmin: true,
          centers: [],
          revision: self.revision,
        }),
      (e) => (e as { code: string }).code === 'SELF_LOCKOUT',
    );
    assert.equal((await dealerCenterOptions(actor, { q: 'Horizon', page: 1 })).items[0].type, 4);
    await assert.rejects(
      () => createDealer({ ...actor, mode: 'legacy' }, dealerCreateSchema.parse(input)),
      (e) => (e as { code: string }).code === 'DEALER_WRITES_DISABLED',
    );
    const operator = await getDealer(actor, 900002);
    await updateDealer(actor, 900002, {
      name: operator.name,
      email: operator.email,
      active: true,
      isSuperAdmin: false,
      revision: operator.revision,
      centers: [{ id: 102, type: 4 }],
    });
    assert.deepEqual(demoDealer(900002)?.ownedKeys, ['102_4']);
  } finally {
    store.close();
  }
});
