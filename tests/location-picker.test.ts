import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  canShowOnMap,
  coordinateFromMap,
  MAP_LATITUDE_LIMIT,
  parseCoordinateFields,
} from '../src/domain/location-picker';
import { parseLegacyLocation, serializeLegacyLocation } from '../src/domain/centers';
import { mapConfiguration } from '../src/server/maps/configuration';
import { centerGrants, type PortalActor } from '../src/domain/access';
import { getCenter, updateCenter } from '../src/server/centers/repository';
import { saveDraft, getDraft, publishDraft } from '../src/server/drafts/repository';
import { emptyProfile } from '../src/domain/management';

test('coordinate entry preserves zero and precision, rejects partial/invalid pairs and keeps valid polar values', () => {
  assert.deepEqual(parseCoordinateFields({ latitude: '0', longitude: '0' }), {
    latitude: 0,
    longitude: 0,
  });
  assert.deepEqual(
    parseCoordinateFields({ latitude: ' -33.9123456789 ', longitude: '151.123456789' }),
    { latitude: -33.9123456789, longitude: 151.123456789 },
  );
  for (const fields of [
    { latitude: '', longitude: '' },
    { latitude: '33', longitude: '' },
    { latitude: '', longitude: '35' },
    { latitude: 'Infinity', longitude: '0' },
    { latitude: '90.1', longitude: '0' },
    { latitude: '0', longitude: '181' },
  ])
    assert.equal(parseCoordinateFields(fields), null);
  const polar = parseCoordinateFields({ latitude: '90', longitude: '180' });
  assert.deepEqual(polar, { latitude: 90, longitude: 180 });
  assert.equal(canShowOnMap(polar), false);
  assert.equal(canShowOnMap({ latitude: MAP_LATITUDE_LIMIT, longitude: -180 }), true);
  assert.equal(canShowOnMap(null), false);
});
test('map selections normalize world copies, retain coordinate order and reject non-projectable values', () => {
  assert.deepEqual(coordinateFromMap(-33.9123456789, 151.123456789), {
    latitude: -33.9123457,
    longitude: 151.1234568,
  });
  for (const [input, output] of [
    [181, -179],
    [-181, 179],
    [540, -180],
    [-540, -180],
    [180, 180],
  ] as const)
    assert.equal(coordinateFromMap(0, input)?.longitude, output);
  for (const value of [
    [NaN, 35],
    [20, Infinity],
    [90, 0],
    [-90, 0],
  ])
    assert.equal(coordinateFromMap(value[0], value[1]), null);
  assert.ok(canShowOnMap(coordinateFromMap(MAP_LATITUDE_LIMIT, 0)));
  const point = coordinateFromMap(-33.9, -70.6)!;
  assert.equal(serializeLegacyLocation(point), '-70.6,-33.9');
  assert.deepEqual(parseLegacyLocation(serializeLegacyLocation(point)), point);
});
test('map configuration defaults off outside development and validates public custom tile metadata', () => {
  assert.deepEqual(mapConfiguration({ NODE_ENV: 'production' }), { enabled: false });
  assert.deepEqual(mapConfiguration({ NODE_ENV: 'test' }), { enabled: false });
  assert.deepEqual(mapConfiguration({ NODE_ENV: 'development', ICARE_MAP_PROVIDER: 'disabled' }), {
    enabled: false,
  });
  const osm = mapConfiguration({ NODE_ENV: 'development' });
  assert.equal(osm.enabled, true);
  if (osm.enabled) {
    assert.equal(osm.tileUrl, 'https://tile.openstreetmap.org/{z}/{x}/{y}.png');
    assert.equal(osm.maxZoom, 19);
  }
  const custom = {
    ICARE_MAP_PROVIDER: 'custom',
    ICARE_MAP_PROVIDER_NAME: 'Approved maps',
    ICARE_MAP_TILE_URL: 'https://tiles.example.test/{z}/{x}/{y}.png',
    ICARE_MAP_ATTRIBUTION_TEXT: '© Approved maps',
    ICARE_MAP_ATTRIBUTION_URL: 'https://maps.example.test/credits',
  };
  assert.equal(mapConfiguration(custom).enabled, true);
  for (const change of [
    { ICARE_MAP_TILE_URL: 'http://tiles.example.test/{z}/{x}/{y}.png' },
    { ICARE_MAP_TILE_URL: 'https://user:secret@tiles.example.test/{z}/{x}/{y}.png' },
    { ICARE_MAP_TILE_URL: 'https://tiles.example.test/{z}/{x}/{y}.png?token=secret' },
    { ICARE_MAP_TILE_URL: 'https://tiles.example.test/{z}/{x}/{bad}.png' },
    { ICARE_MAP_ATTRIBUTION_URL: 'javascript:alert(1)' },
    { ICARE_MAP_MAX_ZOOM: '99' },
    { ICARE_MAP_ATTRIBUTION_TEXT: '' },
  ])
    assert.throws(() => mapConfiguration({ ...custom, ...change }), { code: 'MAP_NOT_CONFIGURED' });
});
test('map selections persist through existing scoped profile saves and owned draft publication', async () => {
  process.env.ICARE_STORAGE_PATH = ':memory:';
  const actor: PortalActor = {
    subject: 'preview:900002',
    dealerId: 900002,
    mode: 'preview',
    name: 'Operator',
    username: 'demo.dealer',
    active: true,
    expiresAt: Date.now() + 600000,
    isSuperAdmin: false,
    sessionId: 'location-test',
    grants: centerGrants(false, ['101_1', '103_1']),
  };
  const ref = { id: 101, type: 1 } as const,
    center = await getCenter(actor, ref),
    location = coordinateFromMap(-33.9, -70.6)!;
  const saved = await updateCenter(actor, ref, center.revision, { ...center.profile, location });
  assert.deepEqual((await getCenter(actor, ref)).profile.location, location);
  await assert.rejects(
    () => updateCenter(actor, ref, center.revision, { ...center.profile, location: null }),
    { code: 'REVISION_CONFLICT' },
  );
  await assert.rejects(() =>
    updateCenter({ ...actor, grants: [] }, ref, saved.revision, {
      ...center.profile,
      location: null,
    }),
  );
  await assert.rejects(() =>
    updateCenter(actor, { id: 101, type: 4 }, saved.revision, {
      ...center.profile,
      location: null,
    }),
  );
  assert.deepEqual((await getCenter(actor, ref)).profile.location, location);
  const cleared = await updateCenter(actor, ref, saved.revision, {
    ...saved.profile,
    location: null,
  });
  assert.equal(cleared.profile.location, null);
  const draft = await saveDraft(actor, {
    type: 4,
    domain: 'fictionalmapdraft',
    profile: { ...emptyProfile, name: 'Fictional map draft', location },
  });
  assert.deepEqual((await getDraft(actor, draft.id)).data.profile.location, location);
  const created = await publishDraft(actor, draft.id, draft.revision);
  const scoped = { ...actor, grants: centerGrants(false, [`${created.id}_${created.type}`]) };
  assert.deepEqual((await getCenter(scoped, created)).profile.location, location);
});
