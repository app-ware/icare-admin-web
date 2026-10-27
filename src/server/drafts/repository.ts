import 'server-only';
import { randomUUID } from 'node:crypto';
import sql from 'mssql';
import { z } from 'zod';
import {
  assertPermission,
  AccessDeniedError,
  centerGrants,
  type PortalActor,
} from '@/domain/access';
import { centerKey } from '@/domain/centers';
import {
  BRANDING_STAGE_MS,
  brandingKindSchema,
  type BrandingAsset,
  type BrandingKind,
} from '@/domain/branding';
import { draftSchema, type CenterDraftData, type SavedDraft } from '@/domain/management';
import { getStore } from '@/server/store';
import { getPool } from '@/server/db/pools';
import { demoDealer } from '@/server/auth/dealers';
import { previewDealerDetail } from '@/server/dealers/preview';
import { brandingWritesEnabled } from '@/server/runtime';
import { normalizeImage } from '@/server/branding/images';
import { consumeBrandingUploadLimit, purgeExpiredBrandingPreviews } from '@/server/branding/limits';
import { PortalError } from '@/server/http';

type Row = Record<string, unknown>;
const missing = () =>
  new PortalError(
    404,
    'DRAFT_NOT_FOUND',
    'This draft or image is unavailable or outside your access.',
  );
const enabled = (actor: PortalActor) => actor.mode === 'preview' || brandingWritesEnabled();
function writes(actor: PortalActor) {
  if (!enabled(actor))
    throw new PortalError(
      503,
      'BRANDING_WRITES_DISABLED',
      'Draft image changes are disabled in this environment.',
    );
}
function currentActor(actor: PortalActor) {
  assertPermission(actor, 'centers.create');
  if (actor.mode === 'preview') {
    const identity = previewDealerDetail(getStore(), actor.dealerId);
    if (!identity?.active) throw new AccessDeniedError();
    assertPermission(
      { ...actor, grants: centerGrants(identity.isSuperAdmin, identity.centers.map(centerKey)) },
      'centers.create',
    );
  }
}
async function active<T>(actor: PortalActor, action: () => T): Promise<T> {
  assertPermission(actor, 'centers.create');
  if (actor.mode === 'preview') {
    demoDealer(actor.dealerId);
    return action();
  }
  const tx = new sql.Transaction(await getPool('secure'));
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const r = await new sql.Request(tx)
      .input('actor', sql.Int, actor.dealerId)
      .query(
        'SELECT dealer_id FROM dbo.Dealers WITH(HOLDLOCK) WHERE dealer_id=@actor AND is_active=1',
      );
    if (r.recordset.length !== 1) throw new AccessDeniedError();
    return action();
  } finally {
    await tx.rollback().catch(() => undefined);
  }
}
function owned(actor: PortalActor, id: string, unpublished = true) {
  z.uuid().parse(id);
  currentActor(actor);
  const row = getStore()
    .db.prepare('SELECT * FROM drafts WHERE id=? AND dealer_id=? AND mode=?')
    .get(id, actor.dealerId, actor.mode);
  if (!row) throw missing();
  if (unpublished && row.published_id !== null)
    throw new PortalError(
      409,
      'DRAFT_PUBLISHED',
      'This draft has already been added to the demo directory. Open the created center.',
    );
  return row;
}
function inDraft<T>(actor: PortalActor, id: string, action: (row: Row) => T) {
  return active(actor, () => getStore().transaction(() => action(owned(actor, id))));
}
export async function getDraft(actor: PortalActor, id: string) {
  return active(actor, () =>
    getStore().transaction(() => {
      owned(actor, id, false);
      return getStore()
        .drafts(actor.dealerId, actor.mode)
        .find((d) => d.id === id)!;
    }),
  );
}
export async function saveDraft(
  actor: PortalActor,
  data: CenterDraftData,
  id?: string,
  revision?: number,
) {
  const input = draftSchema.parse(data);
  if (id) z.uuid().parse(id);
  return active(actor, () =>
    getStore().saveDraft(actor.dealerId, actor.mode, input, id, revision, () => {
      currentActor(actor);
      const old = id ? (JSON.parse(String(owned(actor, id).data)) as CenterDraftData) : null;
      if (
        input.branding !== undefined &&
        (['logo', 'photo'] as const).some((k) => input.branding?.[k] !== old?.branding?.[k])
      )
        writes(actor);
    }),
  );
}
export async function deleteDraft(actor: PortalActor, id: string, revision: number) {
  z.uuid().parse(id);
  z.number().int().positive().parse(revision);
  return active(actor, () =>
    getStore().deleteDraft(actor.dealerId, actor.mode, id, revision, () => {
      currentActor(actor);
      if (
        getStore()
          .db.prepare('SELECT 1 FROM draft_images WHERE draft_id=? AND dealer_id=? AND mode=?')
          .get(id, actor.dealerId, actor.mode)
      )
        writes(actor);
    }),
  );
}
export async function publishDraft(actor: PortalActor, id: string, revision: number) {
  z.uuid().parse(id);
  assertPermission(actor, 'centers.create');
  if (actor.mode !== 'preview')
    throw new PortalError(
      503,
      'PROVISIONING_PENDING',
      'Your draft and private images are saved. Live center provisioning remains pending.',
    );
  return active(actor, () =>
    getStore().publishPreview(actor.dealerId, id, revision, () => currentActor(actor)),
  );
}
export async function getDraftBranding(actor: PortalActor, id: string) {
  return inDraft(actor, id, (row) => ({
    draftId: id,
    revision: Number(row.revision),
    ...getStore().draftBranding(actor.dealerId, actor.mode, id),
    canManage: enabled(actor),
  }));
}
export async function prepareDraftUpload(actor: PortalActor, id: string) {
  await inDraft(actor, id, () => writes(actor));
  consumeBrandingUploadLimit(actor);
}
function metadata(row: Row, draftId: string): BrandingAsset {
  return {
    id: String(row.id),
    kind: row.kind as BrandingKind,
    url: `/api/center-drafts/${draftId}/branding/assets/${row.id}`,
    mime: row.mime as BrandingAsset['mime'],
    width: Number(row.width),
    height: Number(row.height),
    bytes: Number(row.bytes),
    createdAt: Number(row.created_at),
    expiresAt: row.expires_at === null ? null : Number(row.expires_at),
  };
}
export async function stageDraftImage(
  actor: PortalActor,
  id: string,
  kind: BrandingKind,
  bytes: Buffer,
  mime: string,
  extension: string,
) {
  brandingKindSchema.parse(kind);
  await inDraft(actor, id, () => writes(actor));
  const image = await normalizeImage(bytes, kind, mime, extension);
  return inDraft(actor, id, () => {
    writes(actor);
    const store = getStore(),
      now = Date.now();
    purgeExpiredBrandingPreviews(actor);
    store.db
      .prepare(
        "DELETE FROM draft_images WHERE mode=? AND dealer_id=? AND draft_id=? AND state='retired' AND expires_at<=?",
      )
      .run(actor.mode, actor.dealerId, id, now);
    const count = store.db
      .prepare(
        "SELECT (SELECT COUNT(*) FROM draft_images WHERE mode=? AND dealer_id=? AND state='staged')+(SELECT COUNT(*) FROM branding_assets WHERE mode=? AND actor_id=? AND state='staged') AS n",
      )
      .get(actor.mode, actor.dealerId, actor.mode, actor.dealerId);
    const draft = store.db
      .prepare(
        'SELECT COALESCE(SUM(bytes),0) AS bytes FROM draft_images WHERE mode=? AND dealer_id=? AND draft_id=?',
      )
      .get(actor.mode, actor.dealerId, id);
    const total = store.db
      .prepare(
        'SELECT (SELECT COALESCE(SUM(bytes),0) FROM draft_images)+(SELECT COALESCE(SUM(bytes),0) FROM branding_assets) AS bytes',
      )
      .get();
    if (
      Number(count?.n) >= 4 ||
      Number(draft?.bytes) + image.bytes > 64 * 1024 * 1024 ||
      Number(total?.bytes) + image.bytes > 512 * 1024 * 1024
    )
      throw new PortalError(
        409,
        'IMAGE_STORAGE_LIMIT',
        'Image storage is full. Discard unused previews or ask an administrator to review retention.',
      );
    const assetId = randomUUID();
    store.db
      .prepare("INSERT INTO draft_images VALUES(?,?,?,?,?,?,?,?,?,?,'staged',?,?)")
      .run(
        assetId,
        actor.mode,
        actor.dealerId,
        id,
        kind,
        image.mime,
        image.width,
        image.height,
        image.bytes,
        image.data,
        now,
        now + BRANDING_STAGE_MS,
      );
    return metadata(
      store.db
        .prepare(
          'SELECT id,kind,mime,width,height,bytes,created_at,expires_at FROM draft_images WHERE id=?',
        )
        .get(assetId)!,
      id,
    );
  });
}
export async function readDraftImage(actor: PortalActor, id: string, assetId: string) {
  z.uuid().parse(assetId);
  return inDraft(actor, id, (row) => {
    const data = JSON.parse(String(row.data)) as CenterDraftData;
    const image = getStore()
      .db.prepare(
        "SELECT * FROM draft_images WHERE id=? AND draft_id=? AND dealer_id=? AND mode=? AND ((state='staged' AND expires_at>?) OR state='saved')",
      )
      .get(assetId, id, actor.dealerId, actor.mode, Date.now());
    if (
      !image ||
      (image.state === 'saved' && data.branding?.[image.kind as BrandingKind] !== assetId)
    )
      throw missing();
    return {
      data: Buffer.from(image.data as Uint8Array),
      mime: String(image.mime),
      kind: String(image.kind),
    };
  });
}
export async function discardDraftImage(actor: PortalActor, id: string, assetId: string) {
  z.uuid().parse(assetId);
  return inDraft(actor, id, () => {
    writes(actor);
    const r = getStore()
      .db.prepare(
        "DELETE FROM draft_images WHERE id=? AND draft_id=? AND dealer_id=? AND mode=? AND state='staged'",
      )
      .run(assetId, id, actor.dealerId, actor.mode);
    if (r.changes !== 1) throw missing();
    return { ok: true };
  });
}
