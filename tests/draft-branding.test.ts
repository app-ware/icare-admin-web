import { test } from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { centerGrants, type PortalActor } from '../src/domain/access';
import { draftSchema, emptyProfile } from '../src/domain/management';
import { getStore } from '../src/server/store';
import {
  saveDraft,
  getDraft,
  getDraftBranding,
  stageDraftImage,
  readDraftImage,
  discardDraftImage,
  publishDraft,
  deleteDraft,
} from '../src/server/drafts/repository';
import {
  getBranding,
  readBrandingImage,
  stageBranding,
  discardBranding,
} from '../src/server/branding/repository';

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
  sessionId: 'draft-test',
  grants: centerGrants(false, ['101_1', '103_1']),
};
const admin: PortalActor = {
  ...actor,
  dealerId: 900001,
  subject: 'preview:900001',
  isSuperAdmin: true,
  grants: centerGrants(true, []),
};
const data = (domain: string) =>
  draftSchema.parse({
    type: 1,
    domain,
    profile: { ...emptyProfile, name: 'Fictional draft center' },
  });
const png = () =>
  sharp({ create: { width: 40, height: 30, channels: 4, background: '#3687d6' } })
    .png()
    .toBuffer();

test('draft images save, resume and replace with profile and revision in one transaction', async () => {
  const store = getStore(),
    initial = await saveDraft(actor, data('draftimages1')),
    bytes = await png();
  const logo = await stageDraftImage(actor, initial.id, 'logo', bytes, 'image/png', 'PNG'),
    photo = await stageDraftImage(actor, initial.id, 'photo', bytes, 'image/png', 'png');
  assert.equal((await getDraft(actor, initial.id)).branding.logo, null);
  assert.equal((await readDraftImage(actor, initial.id, logo.id)).mime, 'image/png');
  let saved = await saveDraft(
    actor,
    { ...initial.data, branding: { logo: logo.id, photo: photo.id } },
    initial.id,
    initial.revision,
  );
  assert.equal(saved.branding.logo?.id, logo.id);
  assert.equal(saved.branding.photo?.id, photo.id);
  assert.equal(saved.branding.logo?.expiresAt, null);
  assert.equal((await getDraftBranding(actor, initial.id)).revision, saved.revision);
  // Saved attachments survive old clients omitting the optional branding property.
  const { branding, ...withoutBranding } = saved.data;
  saved = await saveDraft(actor, { ...withoutBranding, type: 4 }, saved.id, saved.revision);
  assert.equal(saved.data.branding?.logo, logo.id);
  assert.equal(saved.data.type, 4);
  const next = await stageDraftImage(actor, initial.id, 'logo', bytes, 'image/png', 'png');
  await assert.rejects(
    () =>
      saveDraft(
        actor,
        { ...saved.data, branding: { logo: next.id, photo: photo.id } },
        saved.id,
        initial.revision,
      ),
    { code: 'DRAFT_CONFLICT' },
  );
  assert.equal((await getDraft(actor, saved.id)).branding.logo?.id, logo.id);
  store.db.exec(
    "CREATE TEMP TRIGGER fail_draft_write BEFORE UPDATE ON drafts BEGIN SELECT RAISE(ABORT,'acceptance'); END",
  );
  await assert.rejects(() =>
    saveDraft(
      actor,
      { ...saved.data, branding: { logo: next.id, photo: photo.id } },
      saved.id,
      saved.revision,
    ),
  );
  store.db.exec('DROP TRIGGER fail_draft_write');
  assert.equal((await getDraft(actor, saved.id)).revision, saved.revision);
  assert.ok((await readDraftImage(actor, saved.id, logo.id)).data.length);
  saved = await saveDraft(
    actor,
    { ...saved.data, branding: { logo: next.id } },
    saved.id,
    saved.revision,
  );
  assert.equal(saved.branding.photo, null);
  assert.equal(saved.branding.logo?.id, next.id);
  await assert.rejects(() => readDraftImage(actor, saved.id, logo.id), { code: 'DRAFT_NOT_FOUND' });
  await assert.rejects(() => discardDraftImage(actor, saved.id, next.id), {
    code: 'DRAFT_NOT_FOUND',
  });
  await assert.rejects(() => deleteDraft(actor, saved.id, initial.revision), {
    code: 'DRAFT_CONFLICT',
  });
  await deleteDraft(actor, saved.id, saved.revision);
  assert.equal(
    store.db.prepare('SELECT COUNT(*) AS n FROM draft_images WHERE draft_id=?').get(saved.id)?.n,
    0,
  );
});
test('draft images cannot cross owner, mode, draft, slot or published-center boundaries', async () => {
  const store = getStore(),
    a = await saveDraft(actor, data('draftscope1')),
    b = await saveDraft(actor, data('draftscope2')),
    bytes = await png();
  const image = await stageDraftImage(actor, a.id, 'logo', bytes, 'image/png', 'png');
  for (const user of [
    admin,
    { ...actor, grants: [] },
    { ...actor, expiresAt: 0 },
    { ...actor, dealerId: 900099, grants: centerGrants(true, []) },
  ]) {
    await assert.rejects(() => getDraft(user, a.id));
    await assert.rejects(() => readDraftImage(user, a.id, image.id));
    await assert.rejects(() =>
      saveDraft(user, { ...a.data, branding: { logo: image.id } }, a.id, a.revision),
    );
  }
  await assert.rejects(() => readDraftImage(actor, b.id, image.id), { code: 'DRAFT_NOT_FOUND' });
  await assert.rejects(
    () => saveDraft(actor, { ...b.data, branding: { logo: image.id } }, b.id, b.revision),
    { code: 'DRAFT_IMAGE_UNAVAILABLE' },
  );
  await assert.rejects(
    () => saveDraft(actor, { ...a.data, branding: { photo: image.id } }, a.id, a.revision),
    { code: 'DRAFT_IMAGE_UNAVAILABLE' },
  );
  const foreign = store.saveDraft(actor.dealerId, 'legacy', data('draftothermode'));
  await assert.rejects(() => getDraft(actor, foreign.id), { code: 'DRAFT_NOT_FOUND' });
  await assert.rejects(() => deleteDraft(admin, a.id, a.revision));
  await discardDraftImage(actor, a.id, image.id);
  assert.equal((await getDraft(actor, a.id)).revision, a.revision);
  assert.equal(
    draftSchema.safeParse({ ...a.data, branding: { logo: '../../private' } }).success,
    false,
  );
  assert.equal(draftSchema.safeParse({ ...a.data, branding: { actorId: 900001 } }).success, false);
  await deleteDraft(actor, a.id, a.revision);
  await deleteDraft(actor, b.id, b.revision);
});
test('expired unsaved images cannot replace saved images; draft deletion cleans only its own media', async () => {
  const store = getStore(),
    a = await saveDraft(actor, data('draftexpiry1')),
    b = await saveDraft(actor, data('draftexpiry2')),
    bytes = await png();
  const selected = await stageDraftImage(actor, a.id, 'logo', bytes, 'image/png', 'png');
  const saved = await saveDraft(
    actor,
    { ...a.data, branding: { logo: selected.id } },
    a.id,
    a.revision,
  );
  store.db.prepare('UPDATE draft_images SET created_at=0 WHERE id=?').run(selected.id);
  assert.ok((await readDraftImage(actor, a.id, selected.id)).data.length);
  const pending = await stageDraftImage(actor, a.id, 'logo', bytes, 'image/png', 'png');
  store.db.prepare('UPDATE draft_images SET expires_at=0 WHERE id=?').run(pending.id);
  await assert.rejects(
    () =>
      saveDraft(actor, { ...saved.data, branding: { logo: pending.id } }, saved.id, saved.revision),
    { code: 'DRAFT_IMAGE_UNAVAILABLE' },
  );
  const kept = await stageDraftImage(actor, b.id, 'photo', bytes, 'image/png', 'png');
  await deleteDraft(actor, saved.id, saved.revision);
  assert.ok((await readDraftImage(actor, b.id, kept.id)).data.length);
  await deleteDraft(actor, b.id, b.revision);
});
test('demo publication transfers all images atomically and retry creates no extra center or image', async () => {
  const store = getStore(),
    bytes = await png();
  for (const type of [1, 3, 4] as const) {
    const initial = await saveDraft(actor, { ...data(`draftpublish${type}`), type });
    const logo = await stageDraftImage(actor, initial.id, 'logo', bytes, 'image/png', 'png'),
      photo = await stageDraftImage(actor, initial.id, 'photo', bytes, 'image/png', 'png');
    const saved = await saveDraft(
      actor,
      { ...initial.data, branding: { logo: logo.id, photo: photo.id } },
      initial.id,
      initial.revision,
    );
    store.db.exec(
      "CREATE TEMP TRIGGER fail_draft_publish BEFORE INSERT ON branding_operations BEGIN SELECT RAISE(ABORT,'acceptance'); END",
    );
    await assert.rejects(() => publishDraft(actor, saved.id, saved.revision));
    store.db.exec('DROP TRIGGER fail_draft_publish');
    assert.equal(
      store.db
        .prepare('SELECT COUNT(*) AS n FROM preview_centers WHERE domain=?')
        .get(saved.data.domain)?.n,
      0,
    );
    assert.ok((await readDraftImage(actor, saved.id, logo.id)).data.length);
    await assert.rejects(() => publishDraft(actor, saved.id, initial.revision), {
      code: 'DRAFT_CONFLICT',
    });
    const center = await publishDraft(actor, saved.id, saved.revision);
    assert.deepEqual(await publishDraft(actor, saved.id, saved.revision), center);
    const current = await getBranding(
      { ...actor, grants: centerGrants(false, [`${center.id}_${center.type}`]) },
      center,
    );
    assert.notEqual(current.logo?.id, logo.id);
    assert.equal((await readBrandingImage(admin, center, current.photo!.id)).mime, 'image/jpeg');
    assert.equal(
      store.db.prepare('SELECT COUNT(*) AS n FROM draft_images WHERE draft_id=?').get(saved.id)?.n,
      0,
    );
    assert.equal(
      store.db
        .prepare(
          'SELECT COUNT(*) AS n FROM branding_assets WHERE mode=? AND center_id=? AND center_type=?',
        )
        .get('preview', center.id, center.type)?.n,
      2,
    );
    await assert.rejects(() => readDraftImage(actor, saved.id, logo.id), {
      code: 'DRAFT_PUBLISHED',
    });
    await assert.rejects(
      () => stageDraftImage(actor, saved.id, 'logo', bytes, 'image/png', 'png'),
      { code: 'DRAFT_PUBLISHED' },
    );
    await assert.rejects(() => deleteDraft(actor, saved.id, saved.revision));
  }
});
test('inactive stored actors fail closed and live provisioning stays disabled', async () => {
  const store = getStore(),
    draft = await saveDraft(actor, data('draftactive')),
    bytes = await png();
  store.db.prepare('UPDATE preview_dealers SET active=0 WHERE id=?').run(actor.dealerId);
  try {
    await assert.rejects(() => getDraft(actor, draft.id));
    await assert.rejects(() => stageDraftImage(actor, draft.id, 'logo', bytes, 'image/png', 'png'));
    await assert.rejects(() => publishDraft(actor, draft.id, draft.revision));
  } finally {
    store.db.prepare('UPDATE preview_dealers SET active=1 WHERE id=?').run(actor.dealerId);
  }
  await assert.rejects(() => publishDraft({ ...actor, mode: 'legacy' }, draft.id, draft.revision), {
    code: 'PROVISIONING_PENDING',
  });
  await deleteDraft(actor, draft.id, draft.revision);
});
test('center and draft uploads share the staged-image quota and global storage bound', async () => {
  const store = getStore(),
    draft = await saveDraft(actor, data('draftsharedquota')),
    bytes = await png(),
    ref = { id: 101, type: 1 } as const;
  const centerImage = await stageBranding(actor, ref, 'logo', bytes, 'image/png', 'png');
  const pending = [];
  for (let i = 0; i < 3; i++)
    pending.push(await stageDraftImage(actor, draft.id, 'logo', bytes, 'image/png', 'png'));
  await assert.rejects(() => stageDraftImage(actor, draft.id, 'photo', bytes, 'image/png', 'png'), {
    code: 'IMAGE_STORAGE_LIMIT',
  });
  await assert.rejects(() => stageBranding(actor, ref, 'photo', bytes, 'image/png', 'png'), {
    code: 'IMAGE_STORAGE_LIMIT',
  });
  await discardDraftImage(actor, draft.id, pending[0].id);
  const next = await stageBranding(actor, ref, 'photo', bytes, 'image/png', 'png');
  await deleteDraft(actor, draft.id, draft.revision);
  // A draft upload counts bytes already held by existing-center uploads.
  store.db.prepare('UPDATE branding_assets SET bytes=? WHERE id=?').run(512 * 1024 * 1024, next.id);
  const empty = await saveDraft(actor, data('draftglobalquota'));
  await assert.rejects(() => stageDraftImage(actor, empty.id, 'logo', bytes, 'image/png', 'png'), {
    code: 'IMAGE_STORAGE_LIMIT',
  });
  await discardBranding(actor, ref, centerImage.id);
  await discardBranding(actor, ref, next.id);
  await deleteDraft(actor, empty.id, empty.revision);
});
