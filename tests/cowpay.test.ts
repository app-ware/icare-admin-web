import { test } from 'node:test';
import assert from 'node:assert/strict';
import { centerGrants, hasPermission, type PortalActor } from '../src/domain/access';
import {
  cowpayState,
  cowpayQuerySchema,
  parseCowpayQuery,
  cowpayRefSchema,
  type CowpayObservation,
} from '../src/domain/cowpay';
import { cowpayCallback } from '../src/server/cowpay/configuration';
import { getCowpay, listCowpay } from '../src/server/cowpay/repository';
import { getStore } from '../src/server/store';
import { emptyProfile } from '../src/domain/management';

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
  sessionId: 'cowpay-test',
  grants: centerGrants(false, ['101_1', '103_1']),
};
const admin: PortalActor = {
  ...actor,
  subject: 'preview:900001',
  dealerId: 900001,
  isSuperAdmin: true,
  grants: centerGrants(true, []),
};
const base: CowpayObservation = {
  rowCount: 1,
  typeMismatch: 0,
  enabledKnown: 1,
  enabledValue: 0,
  merchantCode: 1,
  merchantHash: 1,
  liveToken: 1,
  stagingToken: 0,
  updatedAt: '2026-10-21T12:00:00.000Z',
};
const ref = { id: 101, type: 1 } as const;

test('CowPay completeness keeps live/staging and shared enablement independent without inventing missing state', () => {
  const live = cowpayState(base);
  assert.equal(live.liveComplete, true);
  assert.equal(live.stagingComplete, false);
  assert.equal(live.storedEnabled, false);
  const staging = cowpayState({ ...base, liveToken: 0, stagingToken: 1, enabledValue: 1 });
  assert.equal(staging.liveComplete, false);
  assert.equal(staging.stagingComplete, true);
  assert.equal(staging.storedEnabled, true);
  for (const common of [{ merchantCode: 0 }, { merchantHash: 0 }]) {
    const row = cowpayState({ ...base, stagingToken: 1, ...common });
    assert.equal(row.liveComplete, false);
    assert.equal(row.stagingComplete, false);
    assert.equal(row.setup, 'incomplete');
  }
  const absent = cowpayState({ ...base, rowCount: 0, enabledKnown: 0, enabledValue: null });
  assert.equal(absent.setup, 'unconfigured');
  assert.equal(absent.configured, false);
  assert.equal(absent.storedEnabled, null);
  assert.equal(absent.updatedAt, null);
  assert.equal(absent.credentials.liveToken, false);
});
test('duplicate, mismatched, null and invalid CowPay metadata never combine into a complete configuration', () => {
  for (const change of [
    { rowCount: 2 },
    { rowCount: -1 },
    { typeMismatch: 1 },
    { merchantHash: 3 },
  ]) {
    const row = cowpayState({ ...base, ...change });
    assert.equal(row.setup, 'review');
    assert.equal(row.configured, null);
    assert.equal(row.credentials.liveToken, null);
    assert.equal(row.liveComplete, false);
    assert.equal(row.updatedAt, null);
  }
  const unknown = cowpayState({ ...base, enabledKnown: 0, enabledValue: null });
  assert.equal(unknown.storedEnabled, null);
  assert.equal(unknown.setup, 'review');
  assert.equal(cowpayState({ ...base, updatedAt: 'bad-date' }).updatedAt, null);
});
test('CowPay queries reject School, arbitrary selectors, duplicates and out-of-range pages', () => {
  assert.equal(
    parseCowpayQuery(new URLSearchParams('type=3&setup=incomplete&enabled=disabled')).type,
    '3',
  );
  for (const query of [
    'type=4',
    'q=a&q=b',
    'database=school',
    'dealerId=4',
    'page=0',
    'page=100001',
    'setup=active',
    'sort=merchant_hash_key',
  ])
    assert.throws(() => parseCowpayQuery(new URLSearchParams(query)));
  assert.equal(cowpayRefSchema.safeParse({ id: 101, type: 4 }).success, false);
});
test('callback metadata requires explicit review and hides invalid/secret-bearing addresses', () => {
  assert.deepEqual(
    cowpayCallback({ ICARE_COWPAY_CALLBACK_URL: 'https://callbacks.example.test/cowpay' }),
    { state: 'pending', url: null },
  );
  const reviewed = {
    ICARE_COWPAY_CALLBACK_REVIEWED: 'true',
    ICARE_COWPAY_CALLBACK_URL: 'https://callbacks.example.test/cowpay',
  };
  assert.deepEqual(cowpayCallback(reviewed), {
    state: 'reviewed',
    url: reviewed.ICARE_COWPAY_CALLBACK_URL,
  });
  for (const url of [
    '',
    'http://callbacks.example.test/cowpay',
    'https://user:private@callbacks.example.test/cowpay',
    'https://callbacks.example.test/cowpay?token=private',
    'https://callbacks.example.test/cowpay#private',
    'javascript:alert(1)',
    'https://callbacks.example.test/cowpay\n',
  ]) {
    assert.deepEqual(cowpayCallback({ ...reviewed, ICARE_COWPAY_CALLBACK_URL: url }), {
      state: 'invalid',
      url: null,
    });
  }
});
test('only ordinary ownership or administrator scope grants CowPay reads; management and numeric exceptions stay denied', () => {
  assert.equal(hasPermission(actor, 'integrations.read', ref), true);
  const pageOnly = {
    ...actor,
    dealerId: 4,
    grants: centerGrants(false, [], ['104_3'], ['104_3'], ['104_3']),
  };
  assert.equal(hasPermission(pageOnly, 'integrations.read', { id: 104, type: 3 }), false);
  assert.equal(hasPermission(actor, 'integrations.manage', ref), false);
  assert.equal(hasPermission(admin, 'integrations.manage', ref), false);
});
test('demo CowPay directory scopes, filters and paginates presence-only records without touching live repositories', async () => {
  const query = cowpayQuerySchema.parse({});
  const directory = await listCowpay(actor, query);
  assert.equal(directory.total, 2);
  assert.equal(directory.summary.liveComplete, 1);
  assert.equal(directory.summary.stagingComplete, 2);
  assert.equal(directory.summary.enabled, 1);
  assert.equal(directory.readOnly, true);
  assert.equal((await listCowpay(actor, { ...query, enabled: 'disabled' })).total, 1);
  assert.equal((await listCowpay(actor, { ...query, type: '3' })).total, 0);
  assert.equal((await getCowpay(actor, ref)).credentials.merchantHash, true);
  await assert.rejects(() => getCowpay(actor, { id: 104, type: 3 }));
  await assert.rejects(() => getCowpay(actor, { id: 101, type: 3 }));
  await assert.rejects(() => getCowpay(admin, { id: 105, type: 4 }));
  const store = getStore();
  for (let i = 0; i < 17; i++)
    store.db
      .prepare(
        'INSERT INTO preview_centers(id,type,domain,profile,active,owner_id,time_zone) VALUES(?,1,?,?,1,?,NULL)',
      )
      .run(
        970000 + i,
        `cowpayfixture${i}`,
        JSON.stringify({
          ...emptyProfile,
          name: `Fictional CowPay batch ${String(i).padStart(2, '0')}`,
        }),
        admin.dealerId,
      );
  const first = await listCowpay(admin, { ...query, q: 'Fictional CowPay batch' });
  const second = await listCowpay(admin, { ...query, q: 'Fictional CowPay batch', page: 2 });
  const empty = await listCowpay(admin, { ...query, q: 'Fictional CowPay batch', page: 3 });
  assert.equal(first.total, 17);
  assert.equal(first.items.length, 12);
  assert.equal(second.items.length, 5);
  assert.equal(empty.items.length, 0);
  assert.equal(empty.total, 17);
  assert.equal(new Set([...first.items, ...second.items].map((r) => r.center.id)).size, 17);
  assert.equal((await listCowpay(admin, { ...query, setup: 'review' })).summary.review, 1);
  const detail = await getCowpay(actor, ref),
    text = JSON.stringify(detail);
  assert.deepEqual(Object.keys(detail.credentials).sort(), [
    'liveToken',
    'merchantCode',
    'merchantHash',
    'stagingToken',
  ]);
  for (const prohibited of ['access_token', 'merchant_hash_key', 'default_customer', 'password'])
    assert.equal(text.includes(prohibited), false);
  assert.equal(detail.callback.url, null);
  assert.equal(detail.mode, 'preview');
});
test('stored dealer revocation, role changes and removed center assignments override cached CowPay grants', async () => {
  const store = getStore();
  await getCowpay(actor, ref);
  store.db
    .prepare(
      'DELETE FROM preview_dealer_centers WHERE dealer_id=? AND center_id=? AND center_type=?',
    )
    .run(actor.dealerId, ref.id, ref.type);
  try {
    await assert.rejects(() => getCowpay(actor, ref));
    assert.equal((await listCowpay(actor, cowpayQuerySchema.parse({}))).total, 1);
  } finally {
    store.db
      .prepare('INSERT INTO preview_dealer_centers VALUES(?,?,?)')
      .run(actor.dealerId, ref.id, ref.type);
  }
  store.db.prepare('UPDATE preview_dealers SET active=0 WHERE id=?').run(actor.dealerId);
  try {
    await assert.rejects(() => getCowpay(actor, ref));
    await assert.rejects(() => listCowpay(actor, cowpayQuerySchema.parse({})));
  } finally {
    store.db.prepare('UPDATE preview_dealers SET active=1 WHERE id=?').run(actor.dealerId);
  }
  store.db.prepare('UPDATE preview_dealers SET is_admin=0 WHERE id=?').run(admin.dealerId);
  try {
    await assert.rejects(() => getCowpay(admin, ref));
  } finally {
    store.db.prepare('UPDATE preview_dealers SET is_admin=1 WHERE id=?').run(admin.dealerId);
  }
});
