import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PortalStore, IDLE_MS, ABSOLUTE_MS, digest, getStore } from '../src/server/store';
import { centerGrants, hasPermission, type PortalActor } from '../src/domain/access';
import {
  draftSchema,
  emptyProfile,
  directoryQuerySchema,
  profileSchema,
} from '../src/domain/management';
import { assertOrigin, PortalError } from '../src/server/http';
import { listCenters, getCenter, updateCenter } from '../src/server/centers/repository';
import { getPool } from '../src/server/db/pools';

test('opaque sessions persist only hashes, expire on idle/absolute limits, and revoke without resurrection', () => {
  const store = new PortalStore(':memory:');
  try {
    const created = store.createSession(7, 'legacy', 'stamp', 1000);
    assert.equal(created.token.length, 43);
    const row = store.db.prepare('SELECT * FROM sessions').get()!;
    assert.equal(row.hash, digest(created.token));
    assert.ok(!Object.values(row).includes(created.token));
    assert.equal(store.session(created.token, 1001)?.dealerId, 7);
    assert.equal(store.session(created.token, 1001 + IDLE_MS), null);
    const next = store.createSession(7, 'legacy', 'stamp', 1000);
    for (let now = 1001; now < 1000 + ABSOLUTE_MS; now += IDLE_MS / 2)
      assert.ok(store.session(next.token, now));
    assert.equal(store.session(next.token, 1000 + ABSOLUTE_MS), null);
    const live = store.createSession(7, 'legacy', 'stamp');
    store.revoke(live.token);
    assert.equal(store.session(live.token), null);
    assert.equal(store.session('forged'), null);
  } finally {
    store.close();
  }
});
test('session revocation is bounded to the current dealer and identity mode', () => {
  const s = new PortalStore(':memory:');
  try {
    const current = s.createSession(7, 'legacy', 'x');
    const other = s.createSession(7, 'legacy', 'x');
    const preview = s.createSession(7, 'preview', 'x');
    const different = s.createSession(8, 'legacy', 'x');
    s.revokeOthers(7, 'legacy', current.id);
    assert.ok(s.session(current.token));
    assert.equal(s.session(other.token), null);
    assert.ok(s.session(preview.token));
    assert.ok(s.session(different.token));
  } finally {
    s.close();
  }
});
test('throttling stops attempts and resets after the specified window', () => {
  const s = new PortalStore(':memory:');
  try {
    for (let i = 0; i < 6; i++) assert.equal(s.consumeLimit('account', 6, 100, 1000), true);
    assert.equal(s.consumeLimit('account', 6, 100, 1099), false);
    assert.equal(s.consumeLimit('another', 6, 100, 1099), true);
    assert.equal(s.consumeLimit('account', 6, 100, 1100), true);
  } finally {
    s.close();
  }
});
test('draft ownership, revisions and idempotent demo publication protect independent workflows', () => {
  const s = new PortalStore(':memory:');
  try {
    const data = draftSchema.parse({
      type: 4,
      domain: 'newschool',
      profile: { ...emptyProfile, name: 'New school' },
    });
    const d = s.saveDraft(7, 'preview', data);
    assert.equal(s.drafts(8, 'preview').length, 0);
    assert.equal(s.drafts(7, 'legacy').length, 0);
    assert.throws(() => s.saveDraft(8, 'preview', data, d.id, 1), PortalError);
    const updated = s.saveDraft(7, 'preview', data, d.id, 1);
    assert.equal(updated.revision, 2);
    assert.throws(() => s.saveDraft(7, 'preview', data, d.id, 1), PortalError);
    assert.throws(() => s.publishPreview(8, d.id, 2), PortalError);
    const published = s.publishPreview(7, d.id, 2);
    assert.deepEqual(s.publishPreview(7, d.id, 2), published);
    assert.equal(s.previewCenters().filter((c) => c.domain === 'newschool').length, 1);
    assert.throws(() => s.deleteDraft(7, 'preview', d.id), PortalError);
  } finally {
    s.close();
  }
});
test('center services deny cross-center and cross-type access, enforce revisions and preserve edits', async () => {
  process.env.ICARE_STORAGE_PATH = ':memory:';
  const actor: PortalActor = {
    subject: 'preview:900002',
    dealerId: 900002,
    active: true,
    expiresAt: Date.now() + 60000,
    grants: centerGrants(false, ['101_1', '103_1']),
    name: 'Test',
    username: 'test',
    mode: 'preview',
    isSuperAdmin: false,
    sessionId: 'test',
  };
  const list = await listCenters(actor, directoryQuerySchema.parse({}));
  assert.equal(list.total, 2);
  assert.ok(list.items.every((c) => c.type === 1));
  await assert.rejects(() => getCenter(actor, { id: 101, type: 4 }));
  await assert.rejects(() => getCenter(actor, { id: 102, type: 4 }));
  const center = await getCenter(actor, { id: 101, type: 1 });
  const profile = { ...center.profile, manager: 'Updated manager' };
  const saved = await updateCenter(actor, center, center.revision, profile);
  assert.equal(saved.profile.manager, 'Updated manager');
  await assert.rejects(
    () => updateCenter(actor, center, center.revision, { ...profile, manager: 'Stale update' }),
    (e) => e instanceof PortalError && e.status === 409,
  );
  assert.equal((await getCenter(actor, center)).profile.manager, 'Updated manager');
  assert.equal(
    hasPermission({ ...actor, dealerId: 4, grants: [] }, 'centers.write', center),
    false,
  );
  await assert.rejects(
    () => updateCenter({ ...actor, mode: 'legacy' }, center, saved.revision, profile),
    (e) => e instanceof PortalError && e.code === 'CENTER_WRITES_DISABLED',
  );
  getStore().close();
});
test('profile validation preserves coordinate boundaries and rejects SQL/UI field overreach', () => {
  const p = { ...emptyProfile, name: 'Test center' };
  assert.ok(profileSchema.safeParse(p).success);
  assert.equal(profileSchema.safeParse({ ...p, website: 'javascript:alert(1)' }).success, false);
  assert.equal(
    profileSchema.safeParse({ ...p, website: 'https://example.com/' + 'x'.repeat(250) }).success,
    false,
  );
  assert.equal(
    profileSchema.safeParse({ ...p, location: { latitude: 91, longitude: 0 } }).success,
    false,
  );
  assert.equal(profileSchema.safeParse({ ...p, isSuperAdmin: true }).success, false);
  assert.equal(draftSchema.safeParse({ type: 2, domain: 'valid', profile: p }).success, false);
  assert.equal(
    draftSchema.safeParse({ type: 1, domain: 'x'.repeat(51), profile: p }).success,
    false,
  );
});
test('origin checks reject missing/cross-site origins, and pending databases cannot be opened', async () => {
  assert.throws(
    () => assertOrigin(new Request('http://localhost/action', { method: 'POST' })),
    PortalError,
  );
  assert.throws(
    () =>
      assertOrigin(
        new Request('http://localhost/action', {
          method: 'POST',
          headers: { origin: 'https://attacker.example' },
        }),
      ),
    PortalError,
  );
  assertOrigin(
    new Request('http://localhost/action', {
      method: 'POST',
      headers: { origin: 'http://localhost' },
    }),
  );
  for (const role of ['accounting', 'logging'] as const)
    await assert.rejects(
      () => getPool(role),
      (e) => e instanceof PortalError && e.code === 'DATABASE_PENDING',
    );
});
