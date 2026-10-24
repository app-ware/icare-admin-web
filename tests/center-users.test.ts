import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centerGrants, type PortalActor } from '../src/domain/access';
import {
  centerUserQuerySchema,
  centerUserUpdateSchema,
  centerUserKeySchema,
  assertCenterUserUpdate,
  type CenterUser,
} from '../src/domain/center-users';
import { getStore } from '../src/server/store';
import {
  listCenterUsers,
  getCenterUser,
  updateCenterUser,
  centerUserOptions,
} from '../src/server/center-users/repository';

test('center user contracts enforce composite identities and reject credential, username and role changes', () => {
  const profile = {
    revision: 'a'.repeat(64),
    firstName: 'Taylor',
    lastName: 'Reed',
    email: 'taylor@example.test',
    active: true,
  };
  assert.ok(centerUserUpdateSchema.safeParse(profile).success);
  for (const changed of [
    { password: 'do-not-accept' },
    { username: 'changed' },
    { isAdmin: true },
    { secureId: 1 },
    { firstName: 'x'.repeat(51) },
    { email: 'x'.repeat(51) },
    { active: 'true' },
  ])
    assert.equal(centerUserUpdateSchema.safeParse({ ...profile, ...changed }).success, false);
  for (const key of ['l_1', 's_2', 'l_0']) assert.ok(centerUserKeySchema.safeParse(key).success);
  for (const key of ['l_-1', 's_2147483648', 'l_1 OR 1=1', 's_1/../2'])
    assert.equal(centerUserKeySchema.safeParse(key).success, false);
  assert.equal(centerUserQuerySchema.safeParse({ centerId: 1, centerType: 2 }).success, false);
});
test('center-user policy protects the last linked administrator and leaves unknown/local sign-in state intact', () => {
  const current = {
    localId: 1,
    secureId: 1,
    issues: [],
    active: true,
    isAdmin: true,
    isSuperAdmin: false,
  } as unknown as CenterUser;
  const next = { firstName: '', lastName: '', email: '', revision: 'a'.repeat(64), active: false };
  assert.throws(
    () => assertCenterUserUpdate(current, next, 1),
    (e) => (e as { code: string }).code === 'LAST_CENTER_ADMIN',
  );
  assert.doesNotThrow(() => assertCenterUserUpdate(current, next, 2));
  assert.throws(
    () => assertCenterUserUpdate({ ...current, issues: ['shared_local'] }, next, 2),
    (e) => (e as { code: string }).code === 'MAPPING_REVIEW',
  );
  assert.throws(
    () =>
      assertCenterUserUpdate(
        { ...current, active: null, secureId: null },
        { ...next, active: true },
        2,
      ),
    (e) => (e as { code: string }).code === 'STATUS_UNAVAILABLE',
  );
  assert.throws(
    () => assertCenterUserUpdate(current, { ...next, active: null }, 2),
    (e) => (e as { code: string }).code === 'STATUS_UNAVAILABLE',
  );
});
test('existing users are center-scoped, revision checked, persist safely, and never gain a credential workflow', async () => {
  process.env.ICARE_STORAGE_PATH = ':memory:';
  process.env.ICARE_LIVE_DATA_ENABLED = 'false';
  const store = getStore();
  const actor: PortalActor = {
    subject: 'preview:900002',
    dealerId: 900002,
    name: 'Jamie',
    username: 'demo.dealer',
    isSuperAdmin: false,
    mode: 'preview',
    active: true,
    expiresAt: Date.now() + 60000,
    grants: centerGrants(false, ['101_1', '103_1']),
    sessionId: 'unit',
  };
  const ref = { id: 101, type: 1 as const };
  try {
    const query = centerUserQuerySchema.parse({ centerId: ref.id, centerType: ref.type });
    const directory = await listCenterUsers(actor, query);
    assert.equal(directory.total, 4);
    assert.equal(directory.reviewCount, 1);
    await assert.rejects(() => listCenterUsers(actor, { ...query, centerId: 102, centerType: 4 }));
    await assert.rejects(() =>
      getCenterUser(
        { ...actor, isSuperAdmin: true, grants: centerGrants(true, []) },
        { id: 102, type: 4 },
        'l_1',
      ),
    );
    assert.equal(
      (
        await centerUserOptions(
          { ...actor, isSuperAdmin: true, grants: centerGrants(true, []) },
          { q: '', page: 1 },
        )
      ).items.length,
      2,
    );
    const user = await getCenterUser(actor, ref, 'l_2');
    assert.equal(user.localId, 2);
    assert.equal(user.secureId, 2);
    const profile = {
      firstName: 'Sam revised',
      lastName: user.lastName,
      email: user.email,
      active: false,
      revision: user.revision,
    };
    const saved = await updateCenterUser(actor, ref, user.key, profile);
    assert.equal(saved.firstName, 'Sam revised');
    assert.equal(saved.active, false);
    await assert.rejects(
      () => updateCenterUser(actor, ref, user.key, profile),
      (e) => (e as { code: string }).code === 'REVISION_CONFLICT',
    );
    assert.equal((await getCenterUser(actor, ref, user.key)).active, false);
    const lastAdmin = await getCenterUser(actor, ref, 'l_1');
    await assert.rejects(
      () =>
        updateCenterUser(actor, ref, lastAdmin.key, { ...profile, revision: lastAdmin.revision }),
      (e) => (e as { code: string }).code === 'LAST_CENTER_ADMIN',
    );
    const localOnly = await getCenterUser(actor, ref, 'l_3');
    assert.equal(localOnly.active, null);
    assert.equal(localOnly.canChangeSignIn, false);
    const localSaved = await updateCenterUser(actor, ref, localOnly.key, {
      firstName: localOnly.firstName,
      lastName: 'Profile only',
      email: localOnly.email,
      active: null,
      revision: localOnly.revision,
    });
    assert.equal(localSaved.active, null);
    const orphan = await getCenterUser(actor, ref, 's_4');
    assert.equal(orphan.canEdit, false);
    await assert.rejects(
      () => updateCenterUser(actor, ref, orphan.key, { ...profile, revision: orphan.revision }),
      (e) => (e as { code: string }).code === 'MAPPING_REVIEW',
    );
    for (const key of [
      'Password',
      'user_password',
      'password_salt',
      'refresh_token',
      'access_token',
    ])
      assert.equal(JSON.stringify(directory).includes(`"${key}"`), false);
    store.db.prepare('UPDATE preview_center_users SET is_super_admin=1 WHERE id=2').run();
    const protectedUser = await getCenterUser(actor, ref, 'l_2');
    assert.equal(protectedUser.mapping, 'linked');
    assert.equal(protectedUser.canEdit, false);
    await assert.rejects(
      () => updateCenterUser(actor, ref, 'l_2', { ...profile, revision: protectedUser.revision }),
      /Access denied/,
    );
    await assert.rejects(() => getCenterUser({ ...actor, expiresAt: 0 }, ref, 'l_1'));
  } finally {
    store.close();
  }
});
