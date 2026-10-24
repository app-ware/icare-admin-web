import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  centerDraftSchema,
  centerKey,
  decimalAmountSchema,
  operationalDatabase,
  parseLegacyLocation,
  serializeLegacyLocation,
} from '../src/domain/centers';
import { sampleCenters } from '../src/features/centers/sample-data';

test('legacy coordinates round-trip in longitude-first order including negative hemispheres', () => {
  assert.deepEqual(parseLegacyLocation('35.4965362,33.8807'), {
    latitude: 33.8807,
    longitude: 35.4965362,
  });
  const position = { latitude: -33.9, longitude: -70.6 };
  assert.deepEqual(parseLegacyLocation(serializeLegacyLocation(position)), position);
  for (const invalid of ['', ',', '35,91', '181,33', '35,33,1', 'Infinity,33', 'abc,33'])
    assert.throws(() => parseLegacyLocation(invalid));
});
test('only valid types route to SQL, with intentional Lite compatibility', () => {
  assert.equal(operationalDatabase(1), 'nursery');
  assert.equal(operationalDatabase(3), 'nursery');
  assert.equal(operationalDatabase(4), 'school');
  assert.throws(() => operationalDatabase(2 as 1));
  assert.equal(centerKey(sampleCenters[0]), '101_1');
  assert.throws(() => centerKey({ id: -1, type: 1 }));
});
test('decimal transport retains precision without converting through a float', () => {
  assert.equal(decimalAmountSchema.parse('99999999.1234'), '99999999.1234');
  for (const invalid of ['1e3', 'NaN', '-1', '1,50', '2.12345'])
    assert.equal(decimalAmountSchema.safeParse(invalid).success, false);
});
test('draft validation rejects malformed domains and normalizes valid input', () => {
  const valid = {
    name: '  Sample center  ',
    domain: 'CEDAR',
    manager: 'Sample manager',
    email: 'admin@example.com',
    type: 1,
  };
  assert.equal(centerDraftSchema.parse(valid).domain, 'cedar');
  assert.equal(centerDraftSchema.parse(valid).name, 'Sample center');
  assert.equal(centerDraftSchema.safeParse({ ...valid, domain: "x'; DELETE" }).success, false);
});
