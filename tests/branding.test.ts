import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { centerGrants, hasPermission, type PortalActor } from '../src/domain/access';
import { brandingPublishSchema, IMAGE_MAX_BYTES } from '../src/domain/branding';
import { normalizeImage, readImageBody, reserveImageUpload } from '../src/server/branding/images';
import {
  discardBranding,
  getBranding,
  publishBranding,
  readBrandingImage,
  stageBranding,
  prepareBrandingUpload,
} from '../src/server/branding/repository';
import { getStore } from '../src/server/store';

const png = () =>
  sharp({
    create: {
      width: 48,
      height: 32,
      channels: 4,
      background: { r: 30, g: 130, b: 200, alpha: 0.5 },
    },
  })
    .png()
    .toBuffer();
test('branding images decode, fit legacy bounds, preserve logo alpha and strip source metadata', async () => {
  const original = await sharp({
    create: { width: 1500, height: 500, channels: 3, background: '#abcdef' },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer();
  const logo = await normalizeImage(original, 'logo', 'image/jpeg', 'JPG');
  assert.equal(logo.mime, 'image/png');
  assert.equal(logo.height, 1024);
  assert.ok(logo.width < 1024);
  const meta = await sharp(logo.data).metadata();
  assert.equal(meta.exif, undefined);
  assert.equal(meta.orientation, undefined);
  assert.equal(meta.icc, undefined);
  const transparent = await normalizeImage(await png(), 'logo', 'image/png', 'png');
  assert.equal((await sharp(transparent.data).metadata()).hasAlpha, true);
  const photo = await normalizeImage(await png(), 'photo', 'image/png', 'png');
  assert.equal(photo.mime, 'image/jpeg');
  assert.equal((await sharp(photo.data).metadata()).hasAlpha, false);
});

test('preview quotas, expiry cleanup and upload throttling preserve current images', async () => {
  process.env.ICARE_STORAGE_PATH = ':memory:';
  process.env.ICARE_LIVE_DATA_ENABLED = 'false';
  const actor: PortalActor = {
    subject: 'preview:900001',
    dealerId: 900001,
    mode: 'preview',
    name: 'Admin',
    username: 'demo.admin',
    active: true,
    expiresAt: Date.now() + 60000,
    isSuperAdmin: true,
    sessionId: 'quota',
    grants: centerGrants(true, []),
  };
  const ref = { id: 102, type: 4 as const },
    other = { id: 104, type: 3 as const },
    bytes = await png(),
    store = getStore();
  const staged: Awaited<ReturnType<typeof stageBranding>>[] = [];
  for (let i = 0; i < 4; i++)
    staged.push(await stageBranding(actor, ref, 'logo', bytes, 'image/png', 'png'));
  await assert.rejects(() => stageBranding(actor, ref, 'photo', bytes, 'image/png', 'png'), {
    code: 'IMAGE_STORAGE_LIMIT',
  });
  store.db.prepare('UPDATE branding_assets SET expires_at=0 WHERE id=?').run(staged[0].id);
  const fresh = await stageBranding(actor, other, 'photo', bytes, 'image/png', 'png');
  await assert.rejects(() => readBrandingImage(actor, ref, staged[0].id), {
    code: 'IMAGE_NOT_FOUND',
  });
  for (const asset of staged.slice(1)) await discardBranding(actor, ref, asset.id);
  await discardBranding(actor, other, fresh.id);
  const first = await stageBranding(actor, ref, 'logo', bytes, 'image/png', 'png'),
    before = await getBranding(actor, ref);
  const saved = await publishBranding(actor, ref, { revision: before.revision, logo: first.id });
  store.db.prepare('UPDATE branding_assets SET expires_at=0 WHERE id=?').run(first.id);
  const extra = await stageBranding(actor, ref, 'photo', bytes, 'image/png', 'png');
  assert.equal((await getBranding(actor, ref)).revision, saved.revision);
  assert.ok((await readBrandingImage(actor, ref, first.id)).data.length);
  await discardBranding(actor, ref, extra.id);
  for (let i = 0; i < 20; i++) await prepareBrandingUpload(actor, ref);
  await assert.rejects(() => prepareBrandingUpload(actor, ref), { code: 'UPLOAD_RATE_LIMIT' });
});
test('image validation rejects forged type/extension, SVG/GIF, corruption and either excessive dimension', async () => {
  const bytes = await png();
  for (const [body, mime, extension] of [
    [bytes, 'image/jpeg', 'jpg'],
    [bytes, 'image/png', 'html'],
    [Buffer.from('<svg/>'), 'image/svg+xml', 'svg'],
    [Buffer.from('GIF89a'), 'image/gif', 'gif'],
    [bytes.subarray(0, 30), 'image/png', 'png'],
    [Buffer.alloc(IMAGE_MAX_BYTES + 1), 'image/png', 'png'],
  ] as const)
    await assert.rejects(() => normalizeImage(body, 'logo', mime, extension), {
      code: 'INVALID_IMAGE',
    });
  for (const dimensions of [
    { width: 8193, height: 1 },
    { width: 1, height: 8193 },
    { width: 5000, height: 5000 },
  ]) {
    const huge = await sharp({ create: { ...dimensions, channels: 3, background: 'white' } })
      .png()
      .toBuffer();
    await assert.rejects(() => normalizeImage(huge, 'photo', 'image/png', 'png'), {
      code: 'INVALID_IMAGE',
    });
  }
  const second = await sharp({
    create: { width: 48, height: 32, channels: 4, background: 'green' },
  })
    .png()
    .toBuffer();
  const animated = await sharp([bytes, second], { join: { animated: true } })
    .webp({ delay: [100, 100] })
    .toBuffer();
  assert.equal((await sharp(animated).metadata()).pages, 2);
  await assert.rejects(() => normalizeImage(animated, 'photo', 'image/webp', 'webp'), {
    code: 'INVALID_IMAGE',
  });
});
test('binary uploads enforce the byte limit with and without a Content-Length header', async () => {
  const release1 = reserveImageUpload(),
    release2 = reserveImageUpload();
  assert.throws(() => reserveImageUpload(), { code: 'IMAGE_UPLOAD_BUSY' });
  release1();
  release1();
  const release3 = reserveImageUpload();
  release2();
  release3();
  const input = await png();
  assert.deepEqual(
    await readImageBody(
      new Request('http://localhost/upload', { method: 'POST', body: new Uint8Array(input) }),
    ),
    input,
  );
  await assert.rejects(
    () =>
      readImageBody(
        new Request('http://localhost/upload', {
          method: 'POST',
          headers: { 'content-length': String(IMAGE_MAX_BYTES + 1) },
          body: new Uint8Array(input),
        }),
      ),
    { code: 'IMAGE_TOO_LARGE' },
  );
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      controller.enqueue(new Uint8Array(IMAGE_MAX_BYTES));
      controller.enqueue(new Uint8Array(1));
      controller.close();
    },
  });
  await assert.rejects(
    () =>
      readImageBody(
        new Request('http://localhost/upload', {
          method: 'POST',
          body: stream,
          duplex: 'half',
        } as RequestInit),
      ),
    { code: 'IMAGE_TOO_LARGE' },
  );
});
test('branding publication is atomic, scoped, revision checked and isolated from drafts, profiles and legacy images', async () => {
  process.env.ICARE_STORAGE_PATH = ':memory:';
  process.env.ICARE_LIVE_DATA_ENABLED = 'false';
  const actor: PortalActor = {
    subject: 'preview:900002',
    dealerId: 900002,
    mode: 'preview',
    name: 'Operator',
    username: 'demo.dealer',
    active: true,
    expiresAt: Date.now() + 60000,
    isSuperAdmin: false,
    sessionId: 'unit',
    grants: centerGrants(false, ['101_1', '103_1']),
  };
  const admin: PortalActor = {
    ...actor,
    subject: 'preview:900001',
    dealerId: 900001,
    isSuperAdmin: true,
    grants: centerGrants(true, []),
  };
  const ref = { id: 101, type: 1 as const },
    store = getStore(),
    bytes = await png();
  const initial = await getBranding(actor, ref);
  assert.equal(initial.logo, null);
  assert.equal(initial.photo, null);
  const profile = store.db
    .prepare('SELECT profile FROM preview_centers WHERE id=101 AND type=1')
    .get()?.profile;
  const logo = await stageBranding(actor, ref, 'logo', bytes, 'image/png', 'PNG');
  const photo = await stageBranding(actor, ref, 'photo', bytes, 'image/png', 'png');
  assert.equal((await getBranding(actor, ref)).logo, null);
  assert.equal((await readBrandingImage(actor, ref, logo.id)).mime, 'image/png');
  await assert.rejects(() => readBrandingImage(admin, ref, logo.id), { code: 'IMAGE_NOT_FOUND' });
  await assert.rejects(
    () => publishBranding(admin, ref, { revision: initial.revision, logo: logo.id }),
    { code: 'PREVIEW_UNAVAILABLE' },
  );
  await assert.rejects(
    () =>
      publishBranding(actor, ref, { revision: initial.revision, logo: logo.id, photo: logo.id }),
    { code: 'PREVIEW_UNAVAILABLE' },
  );
  const saved = await publishBranding(actor, ref, {
    revision: initial.revision,
    logo: logo.id,
    photo: photo.id,
  });
  assert.equal(saved.logo?.id, logo.id);
  assert.equal(saved.photo?.id, photo.id);
  assert.ok((await readBrandingImage(admin, ref, logo.id)).data.length);
  await assert.rejects(() => discardBranding(actor, ref, logo.id), { code: 'IMAGE_NOT_FOUND' });
  const next = await stageBranding(actor, ref, 'logo', bytes, 'image/png', 'png');
  await assert.rejects(
    () => publishBranding(actor, ref, { revision: initial.revision, logo: next.id }),
    { code: 'BRANDING_CONFLICT' },
  );
  store.db.exec(
    "CREATE TRIGGER fail_branding_receipt BEFORE INSERT ON branding_operations BEGIN SELECT RAISE(ABORT,'receipt unavailable'); END",
  );
  await assert.rejects(() =>
    publishBranding(actor, ref, { revision: saved.revision, logo: next.id }),
  );
  store.db.exec('DROP TRIGGER fail_branding_receipt');
  assert.equal((await getBranding(actor, ref)).revision, saved.revision);
  assert.ok((await readBrandingImage(actor, ref, logo.id)).data.length);
  const replaced = await publishBranding(actor, ref, { revision: saved.revision, logo: next.id });
  assert.equal(replaced.logo?.id, next.id);
  assert.equal(replaced.photo?.id, photo.id);
  await assert.rejects(() => readBrandingImage(actor, ref, logo.id), { code: 'IMAGE_NOT_FOUND' });
  const canceled = await stageBranding(actor, ref, 'photo', bytes, 'image/png', 'png');
  await discardBranding(actor, ref, canceled.id);
  assert.equal((await getBranding(actor, ref)).revision, replaced.revision);
  const expired = await stageBranding(actor, ref, 'logo', bytes, 'image/png', 'png');
  store.db.prepare('UPDATE branding_assets SET expires_at=0 WHERE id=?').run(expired.id);
  await assert.rejects(() => readBrandingImage(actor, ref, expired.id), {
    code: 'IMAGE_NOT_FOUND',
  });
  await assert.rejects(
    () => publishBranding(actor, ref, { revision: replaced.revision, logo: expired.id }),
    { code: 'PREVIEW_UNAVAILABLE' },
  );
  const bounds = [
    { id: 101, type: 4 as const },
    { id: 104, type: 3 as const },
    { id: 102, type: 4 as const },
  ];
  for (const other of bounds) {
    assert.equal(hasPermission(actor, 'centers.branding.write', other), false);
    await assert.rejects(() => getBranding(actor, other));
    await assert.rejects(() => readBrandingImage(actor, other, next.id));
  }
  for (const bad of [
    { ...actor, grants: [] },
    { ...actor, expiresAt: 0 },
    { ...actor, grants: centerGrants(true, []) },
  ])
    await assert.rejects(() => getBranding(bad, { id: 102, type: 4 }));
  await assert.rejects(() => readBrandingImage(actor, ref, '../../private'));
  for (const change of [
    { revision: replaced.revision },
    { revision: replaced.revision, logo: next.id, actorId: 1 },
    { revision: replaced.revision, photo: '../../x' },
  ])
    assert.equal(brandingPublishSchema.safeParse(change).success, false);
  const pending = await stageBranding(actor, ref, 'logo', bytes, 'image/png', 'png');
  const liveOnlyId = '10000000-0000-4000-8000-000000000001';
  store.db
    .prepare(
      "INSERT INTO branding_assets SELECT ?,'legacy',actor_id,center_id,center_type,kind,mime,width,height,bytes,data,state,created_at,expires_at FROM branding_assets WHERE id=?",
    )
    .run(liveOnlyId, next.id);
  store.db.prepare("INSERT INTO branding_slots VALUES('legacy',101,1,'logo',?,1)").run(liveOnlyId);
  await assert.rejects(() => readBrandingImage(actor, ref, liveOnlyId), {
    code: 'IMAGE_NOT_FOUND',
  });
  store.db
    .prepare(
      'DELETE FROM preview_dealer_centers WHERE dealer_id=? AND center_id=? AND center_type=?',
    )
    .run(actor.dealerId, ref.id, ref.type);
  await assert.rejects(() => readBrandingImage(actor, ref, next.id));
  await assert.rejects(() =>
    publishBranding(actor, ref, { revision: replaced.revision, logo: pending.id }),
  );
  assert.equal(
    store.db.prepare('SELECT profile FROM preview_centers WHERE id=101 AND type=1').get()?.profile,
    profile,
  );
  await assert.rejects(
    () => stageBranding({ ...actor, mode: 'legacy' }, ref, 'logo', bytes, 'image/png', 'png'),
    { code: 'BRANDING_WRITES_DISABLED' },
  );
});
