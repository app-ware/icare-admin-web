import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assertPermission, hasPermission, type Principal } from '../src/domain/access';

const principal: Principal = {
  subject: 'verified-actor',
  dealerId: 7,
  active: true,
  expiresAt: Date.now() + 60000,
  grants: [
    { permission: 'centers.read', scope: { kind: 'centers', keys: ['42_1'] } },
    { permission: 'reports.export', scope: { kind: 'global' } },
  ],
};
test('center permissions cannot cross the nursery/school ID boundary', () => {
  assert.equal(hasPermission(principal, 'centers.read', { id: 42, type: 1 }), true);
  assert.equal(hasPermission(principal, 'centers.read', { id: 42, type: 4 }), false);
  assert.equal(hasPermission(principal, 'centers.read', { id: 43, type: 1 }), false);
  assert.equal(hasPermission(principal, 'centers.write', { id: 42, type: 1 }), false);
  assert.equal(hasPermission(principal, 'centers.read'), false);
});
test('expired, inactive, missing, malformed identities and invalid center types fail closed', () => {
  for (const actor of [
    null,
    { ...principal, active: false },
    { ...principal, expiresAt: 0 },
    { ...principal, expiresAt: NaN },
    { ...principal, dealerId: 0 },
    { ...principal, subject: '' },
  ])
    assert.equal(hasPermission(actor, 'reports.export'), false);
  assert.equal(hasPermission(principal, 'reports.export', { id: 1, type: 99 as 1 }), false);
  assert.throws(() => assertPermission(null, 'payments.write'));
});
test('an explicit global capability does not grant other capabilities', () => {
  assert.equal(hasPermission(principal, 'reports.export', { id: 99, type: 4 }), true);
  assert.equal(hasPermission(principal, 'dealers.manage'), false);
  for (const dealerId of [4, 5])
    assert.equal(hasPermission({ ...principal, dealerId, grants: [] }, 'payments.write'), false);
});
