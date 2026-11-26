import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { centerGrants, type PortalActor } from '../src/domain/access';
import {
  createCenterViewSchema,
  centerViewFilters,
  sameCenterViewFilters,
} from '../src/domain/center-views';
import { directoryQuerySchema } from '../src/domain/management';
import { getStore } from '../src/server/store';
import { demoDealer } from '../src/server/auth/dealers';
import {
  createCenterView,
  listCenterViews,
  updateCenterView,
  removeCenterView,
  restoreCenterView,
} from '../src/server/centers/views';
import { listCenters } from '../src/server/centers/repository';

process.env.ICARE_STORAGE_PATH = ':memory:';
const actor: PortalActor = {
  subject: 'preview:900002',
  dealerId: 900002,
  mode: 'preview',
  name: 'Demo operator',
  username: 'demo.dealer',
  active: true,
  expiresAt: Date.now() + 600000,
  isSuperAdmin: false,
  sessionId: 'views-test',
  grants: centerGrants(false, ['101_1', '103_1']),
};
const admin: PortalActor = {
  ...actor,
  subject: 'preview:900001',
  dealerId: 900001,
  isSuperAdmin: true,
  grants: centerGrants(true, []),
};
const filters = centerViewFilters(
  directoryQuerySchema.parse({
    q: 'Cedar',
    type: '1',
    status: 'active',
    sort: 'name-desc',
    page: 8,
  }),
);
const create = (name = 'Nursery work', who = actor) =>
  createCenterView(who, { id: randomUUID(), name, filters });
beforeEach(() => {
  demoDealer(actor.dealerId);
  getStore().db.exec(
    'DELETE FROM center_views; DELETE FROM throttle; UPDATE preview_dealers SET active=1 WHERE id IN(900001,900002)',
  );
});
test('saved views accept only canonical directory filters, normalized names and bounded strict payloads', () => {
  assert.deepEqual(Object.keys(filters), ['q', 'type', 'status', 'sort']);
  assert.equal(sameCenterViewFilters(filters, { ...filters }), true);
  assert.equal(sameCenterViewFilters(filters, { ...filters, type: '4' }), false);
  const request = { id: randomUUID(), name: '  Ｎursery   queue  ', filters };
  assert.equal(createCenterViewSchema.parse(request).name, 'Nursery queue');
  for (const change of [
    { name: '' },
    { name: 'x'.repeat(61) },
    { name: '\nname' },
    { name: 'a\u200bb' },
    { filters: { ...filters, page: 1 } },
    { filters: { ...filters, centerId: 101 } },
    { filters: { ...filters, type: '2' } },
    { filters: { ...filters, q: 'x'.repeat(121) } },
    { dealerId: 900001 },
    { mode: 'legacy' },
  ])
    assert.equal(createCenterViewSchema.safeParse({ ...request, ...change }).success, false);
  assert.equal(
    createCenterViewSchema.safeParse({ ...request, name: 'ﷺ'.repeat(30) }).success,
    false,
  );
});
test('view creation retries are idempotent and never overwrite later edits or reuse removed IDs', () => {
  const request = { id: randomUUID(), name: 'Review queue', filters },
    first = createCenterView(actor, request);
  assert.deepEqual(createCenterView(actor, request), first);
  const changed = updateCenterView(actor, first.id, {
    revision: first.revision,
    name: 'Renamed queue',
    filters: { ...filters, q: 'Olive' },
  });
  assert.deepEqual(createCenterView(actor, request), changed);
  assert.throws(() => createCenterView(actor, { ...request, name: 'Different' }), {
    code: 'VIEW_CONFLICT',
  });
  removeCenterView(actor, changed.id, { revision: changed.revision });
  assert.throws(() => createCenterView(actor, request), { code: 'VIEW_CONFLICT' });
  assert.equal(listCenterViews(actor).removed.length, 1);
});
test('view owner/mode isolation includes other administrators, direct IDs and revoked capabilities/accounts', () => {
  const view = create(),
    legacy = { ...actor, mode: 'legacy' as const, subject: 'legacy:900002' };
  assert.deepEqual(listCenterViews(admin), { items: [], removed: [] });
  assert.deepEqual(listCenterViews(legacy), { items: [], removed: [] });
  for (const who of [admin, legacy]) {
    assert.throws(
      () => updateCenterView(who, view.id, { revision: view.revision, name: 'Taken', filters }),
      { code: 'VIEW_NOT_FOUND' },
    );
    assert.throws(() => removeCenterView(who, view.id, { revision: view.revision }), {
      code: 'VIEW_NOT_FOUND',
    });
    assert.throws(() => restoreCenterView(who, view.id, { revision: view.revision }), {
      code: 'VIEW_NOT_FOUND',
    });
    assert.throws(() => createCenterView(who, { id: view.id, name: view.name, filters }), {
      code: 'VIEW_NOT_FOUND',
    });
  }
  for (const who of [
    { ...actor, active: false },
    { ...actor, expiresAt: 0 },
    { ...actor, grants: [] },
  ])
    assert.throws(() => listCenterViews(who), { name: 'AccessDeniedError' });
  getStore().db.prepare('UPDATE preview_dealers SET active=0 WHERE id=?').run(actor.dealerId);
  assert.throws(() => create(), { name: 'AccessDeniedError' });
});
test('view names are unique per owner/mode and stale updates/removals/restores preserve newer state', () => {
  const first = create('First'),
    second = create('Second');
  assert.throws(() => create('ＦIRST'), { code: 'VIEW_NAME_EXISTS' });
  create('First', admin);
  const changed = updateCenterView(actor, first.id, {
    revision: first.revision,
    name: 'First revised',
    filters,
  });
  assert.notEqual(changed.revision, first.revision);
  assert.throws(
    () =>
      updateCenterView(actor, first.id, { revision: first.revision, name: 'Lost edit', filters }),
    { code: 'VIEW_CONFLICT' },
  );
  assert.throws(() => removeCenterView(actor, first.id, { revision: first.revision }), {
    code: 'VIEW_CONFLICT',
  });
  assert.throws(
    () =>
      updateCenterView(actor, first.id, { revision: changed.revision, name: second.name, filters }),
    { code: 'VIEW_NAME_EXISTS' },
  );
  const removed = removeCenterView(actor, changed.id, { revision: changed.revision });
  create('First revised');
  assert.throws(() => restoreCenterView(actor, removed.id, { revision: removed.revision }), {
    code: 'VIEW_NAME_EXISTS',
  });
  assert.equal(listCenterViews(actor).items.find((v) => v.id === second.id)?.name, 'Second');
});
test('view removal is recoverable and expiry purges only the current owner/mode archive', () => {
  const view = create(),
    removed = removeCenterView(actor, view.id, { revision: view.revision });
  assert.equal(listCenterViews(actor).items.length, 0);
  const restored = restoreCenterView(actor, view.id, { revision: removed.revision });
  assert.equal(restored.removedAt, null);
  assert.notEqual(restored.revision, view.revision);
  assert.notEqual(restored.revision, removed.revision);
  assert.throws(() => removeCenterView(actor, view.id, { revision: view.revision }), {
    code: 'VIEW_CONFLICT',
  });
  const again = removeCenterView(actor, view.id, { revision: restored.revision }),
    other = create('Other owner', admin);
  removeCenterView(admin, other.id, { revision: other.revision });
  getStore()
    .db.prepare('UPDATE center_views SET removed_at=?')
    .run(Date.now() - 31 * 86400000);
  assert.equal(listCenterViews(actor).removed.length, 0);
  assert.throws(() => restoreCenterView(actor, again.id, { revision: again.revision }), {
    code: 'VIEW_NOT_FOUND',
  });
  assert.equal(
    Number(
      getStore()
        .db.prepare('SELECT COUNT(*) n FROM center_views WHERE dealer_id=?')
        .get(admin.dealerId)?.n,
    ),
    1,
  );
});
test('active/archive view quotas never evict another owner or an active view', () => {
  const other = create('Keep other owner', admin),
    views = Array.from({ length: 20 }, (_, i) => create(`Queue ${i}`));
  assert.throws(() => create('Excess'), { code: 'VIEW_LIMIT' });
  getStore().db.exec('DELETE FROM throttle');
  for (const view of views) removeCenterView(actor, view.id, { revision: view.revision });
  const extra = create('New active'),
    removed = removeCenterView(actor, extra.id, { revision: extra.revision });
  assert.equal(listCenterViews(actor).removed.length, 20);
  assert.throws(() => restoreCenterView(actor, views[0].id, { revision: views[0].revision }), {
    code: 'VIEW_NOT_FOUND',
  });
  restoreCenterView(actor, removed.id, { revision: removed.revision });
  assert.equal(listCenterViews(admin).items[0].id, other.id);
});
test('saved filters never preserve center results or grant access after assignments change', async () => {
  const view = createCenterView(actor, {
    id: randomUUID(),
    name: 'All current centers',
    filters: { ...filters, q: '', type: 'all', status: 'all' },
  });
  const before = await listCenters(actor, { ...view.filters, page: 1 });
  assert.ok(before.items.some((c) => c.id === 101 && c.type === 1));
  getStore()
    .db.prepare(
      'DELETE FROM preview_dealer_centers WHERE dealer_id=? AND center_id=? AND center_type=?',
    )
    .run(actor.dealerId, 101, 1);
  try {
    const identity = demoDealer(actor.dealerId)!,
      fresh = { ...actor, grants: centerGrants(identity.isSuperAdmin, identity.ownedKeys) };
    const after = await listCenters(fresh, { ...listCenterViews(fresh).items[0].filters, page: 1 });
    assert.equal(
      after.items.some((c) => c.id === 101 && c.type === 1),
      false,
    );
    assert.equal(JSON.stringify(listCenterViews(fresh)).includes('Little Cedar'), false);
  } finally {
    getStore()
      .db.prepare('INSERT INTO preview_dealer_centers VALUES(?,?,?)')
      .run(actor.dealerId, 101, 1);
  }
});
test('view storage failure rolls back edits and throttling never changes preferences', () => {
  const view = create();
  getStore().db.exec(
    "CREATE TRIGGER view_failure BEFORE UPDATE ON center_views BEGIN SELECT RAISE(ABORT,'fixture'); END",
  );
  try {
    assert.throws(() => removeCenterView(actor, view.id, { revision: view.revision }));
  } finally {
    getStore().db.exec('DROP TRIGGER view_failure');
  }
  assert.deepEqual(listCenterViews(actor).items[0], view);
  for (let i = 0; i < 28; i++) createCenterView(actor, { id: view.id, name: view.name, filters });
  assert.throws(() => removeCenterView(actor, view.id, { revision: view.revision }), {
    code: 'VIEW_RATE_LIMIT',
  });
  assert.equal(listCenterViews(actor).items.length, 1);
});
test('global view capacity fails without evicting any existing preference', () => {
  const view = create('Keep existing');
  getStore().db.exec(`WITH RECURSIVE n(x) AS (SELECT 1 UNION ALL SELECT x+1 FROM n WHERE x<49999)
    INSERT INTO center_views SELECT printf('00000000-0000-4000-8000-%012x',x),'legacy',100000+x,
    'Other owner','other owner','{"q":"","type":"all","status":"all","sort":"name"}',
    '00000000-0000-4000-8000-000000000000','fixture',0,0,NULL FROM n`);
  assert.throws(() => create('No room'), { code: 'VIEW_STORAGE_LIMIT' });
  assert.deepEqual(listCenterViews(actor).items, [view]);
  assert.equal(
    Number(getStore().db.prepare('SELECT COUNT(*) n FROM center_views').get()?.n),
    50000,
  );
});
