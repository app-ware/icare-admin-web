import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { centerGrants, type PortalActor } from '../src/domain/access';
import { brandingPublishSchema } from '../src/domain/branding';
import { emptyProfile } from '../src/domain/management';
import { normalizeImage } from '../src/server/branding/images';
import { getStore } from '../src/server/store';
import {
  getBranding,
  stageBranding,
  publishBranding,
  readBrandingImage,
  discardBranding,
} from '../src/server/branding/repository';
import {
  saveDraft,
  getDraft,
  stageDraftImage,
  readDraftImage,
  publishDraft,
  deleteDraft,
} from '../src/server/drafts/repository';

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
  sessionId: 'watermark-test',
  grants: centerGrants(false, ['101_1', '103_1']),
};
const admin: PortalActor = {
  ...actor,
  subject: 'preview:900001',
  dealerId: 900001,
  isSuperAdmin: true,
  grants: centerGrants(true, []),
};
const ref = { id: 101, type: 1 } as const;
const png = (width = 1024, height = 1024) =>
  sharp({
    create: { width, height, channels: 4, background: { r: 40, g: 100, b: 180, alpha: 0.4 } },
  })
    .png()
    .toBuffer();
const draftData = (domain: string, type: 1 | 3 | 4 = 1) => ({
  type,
  domain,
  profile: { ...emptyProfile, name: 'Fictional watermark center' },
});

test('watermarks require still PNG and both exact dimensions, retain alpha and strip metadata', async () => {
  const bytes = await sharp(await png())
    .withMetadata({ exif: { IFD0: { Artist: 'Fictional fixture' } } })
    .png()
    .toBuffer();
  const result = await normalizeImage(bytes, 'watermark', 'image/png', 'PNG');
  assert.equal(result.mime, 'image/png');
  assert.equal(result.width, 1024);
  assert.equal(result.height, 1024);
  const meta = await sharp(result.data).metadata();
  assert.equal(meta.hasAlpha, true);
  assert.equal(meta.exif, undefined);
  assert.equal(meta.icc, undefined);
  const { data, info } = await sharp(result.data).raw().toBuffer({ resolveWithObject: true });
  assert.equal(info.channels, 4);
  assert.ok(data[3] > 0 && data[3] < 255);
  for (const [width, height] of [
    [1024, 512],
    [512, 1024],
    [512, 512],
    [1025, 1024],
  ])
    await assert.rejects(
      () => png(width, height).then((b) => normalizeImage(b, 'watermark', 'image/png', 'png')),
      { code: 'INVALID_WATERMARK' },
    );
  for (const format of ['jpeg', 'webp'] as const) {
    const body = await sharp(await png())
      .toFormat(format)
      .toBuffer();
    await assert.rejects(() => normalizeImage(body, 'watermark', `image/${format}`, format), {
      code: 'INVALID_WATERMARK',
    });
    await assert.rejects(() => normalizeImage(body, 'watermark', 'image/png', 'png'), {
      code: 'INVALID_WATERMARK',
    });
  }
  await assert.rejects(() =>
    normalizeImage(bytes.subarray(0, 100), 'watermark', 'image/png', 'png'),
  );
});

test('watermark publication, replacement and removal are atomic and retain revisions after removal', async () => {
  const store = getStore(),
    bytes = await png();
  const before = await getBranding(actor, ref);
  const image = await stageBranding(actor, ref, 'watermark', bytes, 'image/png', 'png');
  await assert.rejects(() => readBrandingImage(admin, ref, image.id), { code: 'IMAGE_NOT_FOUND' });
  await assert.rejects(
    () => publishBranding(admin, ref, { revision: before.revision, watermark: image.id }),
    { code: 'PREVIEW_UNAVAILABLE' },
  );
  await assert.rejects(
    () =>
      publishBranding(actor, ref, {
        revision: before.revision,
        logo: image.id,
        watermark: image.id,
      }),
    { code: 'PREVIEW_UNAVAILABLE' },
  );
  assert.equal((await getBranding(actor, ref)).revision, before.revision);
  let saved = await publishBranding(actor, ref, { revision: before.revision, watermark: image.id });
  assert.equal(saved.watermark?.id, image.id);
  assert.equal((await readBrandingImage(admin, ref, image.id)).mime, 'image/png');
  await assert.rejects(() => discardBranding(actor, ref, image.id), { code: 'IMAGE_NOT_FOUND' });
  const logo = await stageBranding(actor, ref, 'logo', await png(48, 32), 'image/png', 'png');
  saved = await publishBranding(actor, ref, { revision: saved.revision, logo: logo.id });
  assert.equal(saved.watermark?.id, image.id); // Old two-slot requests preserve the watermark.
  const next = await stageBranding(actor, ref, 'watermark', bytes, 'image/png', 'png');
  store.db.exec(
    "CREATE TEMP TRIGGER fail_watermark_receipt BEFORE INSERT ON branding_operations BEGIN SELECT RAISE(ABORT,'fixture'); END",
  );
  try {
    await assert.rejects(() =>
      publishBranding(actor, ref, { revision: saved.revision, watermark: null }),
    );
    await assert.rejects(() =>
      publishBranding(actor, ref, { revision: saved.revision, watermark: next.id }),
    );
  } finally {
    store.db.exec('DROP TRIGGER fail_watermark_receipt');
  }
  assert.equal((await getBranding(actor, ref)).revision, saved.revision);
  assert.ok((await readBrandingImage(actor, ref, image.id)).data.length);
  const replaced = await publishBranding(actor, ref, {
    revision: saved.revision,
    watermark: next.id,
  });
  assert.equal(replaced.logo?.id, logo.id);
  await assert.rejects(() => readBrandingImage(actor, ref, image.id), { code: 'IMAGE_NOT_FOUND' });
  await assert.rejects(
    () => publishBranding(actor, ref, { revision: saved.revision, watermark: null }),
    { code: 'BRANDING_CONFLICT' },
  );
  const removed = await publishBranding(actor, ref, {
    revision: replaced.revision,
    watermark: null,
  });
  assert.equal(removed.watermark, null);
  assert.equal(removed.logo?.id, logo.id);
  assert.notEqual(removed.revision, saved.revision);
  assert.notEqual(removed.revision, before.revision);
  await assert.rejects(() => readBrandingImage(admin, ref, next.id), { code: 'IMAGE_NOT_FOUND' });
  assert.equal(
    store.db.prepare('SELECT state FROM branding_assets WHERE id=?').get(next.id)?.state,
    'retired',
  );
  const readded = await stageBranding(actor, ref, 'watermark', bytes, 'image/png', 'png');
  await publishBranding(actor, ref, { revision: removed.revision, watermark: readded.id });
  await assert.rejects(
    () => publishBranding(actor, ref, { revision: removed.revision, watermark: null }),
    { code: 'BRANDING_CONFLICT' },
  );
  for (const value of [
    { revision: removed.revision, watermark: '../../x' },
    { revision: removed.revision, watermark: null, actorId: 1 },
    { revision: removed.revision, photo: null },
  ])
    assert.equal(brandingPublishSchema.safeParse(value).success, false);
});

test('draft watermarks resume privately, survive old clients and require explicit revision-checked removal', async () => {
  const bytes = await png(),
    store = getStore();
  let draft = await saveDraft(actor, draftData('watermarkdraft'));
  const other = await saveDraft(actor, draftData('watermarkother'));
  const image = await stageDraftImage(actor, draft.id, 'watermark', bytes, 'image/png', 'png');
  await assert.rejects(() => readDraftImage(admin, draft.id, image.id), {
    code: 'DRAFT_NOT_FOUND',
  });
  await assert.rejects(() => readDraftImage(actor, other.id, image.id), {
    code: 'DRAFT_NOT_FOUND',
  });
  await assert.rejects(
    () =>
      saveDraft(
        actor,
        { ...other.data, branding: { watermark: image.id } },
        other.id,
        other.revision,
      ),
    { code: 'DRAFT_IMAGE_UNAVAILABLE' },
  );
  await assert.rejects(
    () =>
      saveDraft(actor, { ...draft.data, branding: { logo: image.id } }, draft.id, draft.revision),
    { code: 'DRAFT_IMAGE_UNAVAILABLE' },
  );
  draft = await saveDraft(
    actor,
    { ...draft.data, branding: { watermark: image.id } },
    draft.id,
    draft.revision,
  );
  assert.equal((await getDraft(actor, draft.id)).branding.watermark?.id, image.id);
  assert.equal(draft.branding.watermark?.expiresAt, null);
  draft = await saveDraft(actor, { ...draft.data, branding: {} }, draft.id, draft.revision);
  assert.equal(draft.branding.watermark?.id, image.id);
  const oldRevision = draft.revision;
  draft = await saveDraft(actor, { ...draft.data, type: 4 }, draft.id, draft.revision);
  await assert.rejects(
    () => saveDraft(actor, { ...draft.data, branding: { watermark: null } }, draft.id, oldRevision),
    { code: 'DRAFT_CONFLICT' },
  );
  assert.ok((await readDraftImage(actor, draft.id, image.id)).data.length);
  draft = await saveDraft(
    actor,
    { ...draft.data, branding: { watermark: null } },
    draft.id,
    draft.revision,
  );
  assert.equal(draft.branding.watermark, null);
  assert.equal(
    store.db.prepare('SELECT state FROM draft_images WHERE id=?').get(image.id)?.state,
    'retired',
  );
  await assert.rejects(() => readDraftImage(actor, draft.id, image.id), {
    code: 'DRAFT_NOT_FOUND',
  });
  await deleteDraft(actor, draft.id, draft.revision);
  await deleteDraft(actor, other.id, other.revision);
});

test('all center types transfer the saved watermark only on successful demo publication', async () => {
  const store = getStore(),
    bytes = await png();
  for (const type of [1, 3, 4] as const) {
    let draft = await saveDraft(actor, draftData(`watermarkpublish${type}`, type));
    const image = await stageDraftImage(actor, draft.id, 'watermark', bytes, 'image/png', 'png');
    draft = await saveDraft(
      actor,
      { ...draft.data, branding: { watermark: image.id } },
      draft.id,
      draft.revision,
    );
    store.db.exec(
      "CREATE TEMP TRIGGER fail_watermark_transfer BEFORE INSERT ON branding_operations BEGIN SELECT RAISE(ABORT,'fixture'); END",
    );
    try {
      await assert.rejects(() => publishDraft(actor, draft.id, draft.revision));
    } finally {
      store.db.exec('DROP TRIGGER fail_watermark_transfer');
    }
    assert.ok((await readDraftImage(actor, draft.id, image.id)).data.length);
    assert.equal((await getDraft(actor, draft.id)).published, null);
    const center = await publishDraft(actor, draft.id, draft.revision);
    assert.deepEqual(await publishDraft(actor, draft.id, draft.revision), center);
    const branding = await getBranding(admin, center);
    assert.ok(branding.watermark);
    assert.notEqual(branding.watermark.id, image.id);
    assert.equal((await readBrandingImage(admin, center, branding.watermark.id)).mime, 'image/png');
    assert.equal(
      store.db.prepare('SELECT COUNT(*) AS n FROM draft_images WHERE draft_id=?').get(draft.id)?.n,
      0,
    );
  }
});
