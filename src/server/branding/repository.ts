import 'server-only';
import sql from 'mssql';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  assertPermission,
  centerGrants,
  AccessDeniedError,
  type PortalActor,
} from '@/domain/access';
import { centerKey, type CenterRef } from '@/domain/centers';
import {
  brandingKindSchema,
  brandingPublishSchema,
  brandingRefSchema,
  BRANDING_STAGE_MS,
  BRANDING_RETENTION_MS,
  type BrandingKind,
  type BrandingAsset,
  type BrandingPublish,
  type CenterBranding,
} from '@/domain/branding';
import { demoDealer } from '@/server/auth/dealers';
import { previewDealerDetail } from '@/server/dealers/preview';
import { getPool } from '@/server/db/pools';
import { getStore, digest } from '@/server/store';
import { brandingWritesEnabled } from '@/server/runtime';
import { PortalError } from '@/server/http';
import { normalizeImage } from './images';
import { consumeBrandingUploadLimit, purgeExpiredBrandingPreviews } from './limits';
type Row = Record<string, unknown>;
type Permission = 'centers.branding.read' | 'centers.branding.write';
const available = (actor: PortalActor) => actor.mode === 'preview' || brandingWritesEnabled();
const missing = () =>
  new PortalError(404, 'IMAGE_NOT_FOUND', 'The image is unavailable or outside your access.');
function assertWrites(actor: PortalActor) {
  if (!available(actor))
    throw new PortalError(
      503,
      'BRANDING_WRITES_DISABLED',
      'Branding uploads are disabled in this environment.',
    );
}
// SQL locks current scope while the synchronous private-store operation completes. No SQL branding fields/files are changed.
async function scoped<T>(
  actor: PortalActor,
  input: CenterRef,
  permission: Permission,
  action: (actual: PortalActor, ref: CenterRef) => T,
): Promise<T> {
  const ref = brandingRefSchema.parse(input);
  assertPermission(actor, permission, ref);
  const store = getStore();
  if (actor.mode === 'preview') {
    demoDealer(actor.dealerId);
    return store.transaction(() => {
      const identity = previewDealerDetail(store, actor.dealerId);
      if (!identity?.active) throw new AccessDeniedError();
      const actual = {
        ...actor,
        isSuperAdmin: identity.isSuperAdmin,
        grants: centerGrants(identity.isSuperAdmin, identity.centers.map(centerKey)),
      };
      assertPermission(actual, permission, ref);
      if (
        !store.db
          .prepare('SELECT 1 FROM preview_centers WHERE id=? AND type=?')
          .get(ref.id, ref.type)
      )
        throw missing();
      return action(actual, ref);
    });
  }
  const tx = new sql.Transaction(await getPool('secure'));
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const db = ref.type === 4 ? 'icare_school' : 'icare';
    const result = await new sql.Request(tx)
      .input('actor', sql.Int, actor.dealerId)
      .input('id', sql.Int, ref.id)
      .input('type', sql.Int, ref.type)
      .query(
        `SELECT c.center_id FROM ${db}.dbo.Care_Center c WITH(HOLDLOCK) WHERE c.center_id=@id AND c.type=@type AND EXISTS(SELECT 1 FROM icare_secure.dbo.Dealers a WITH(HOLDLOCK) WHERE a.dealer_id=@actor AND a.is_active=1 AND (a.is_super_admin=1 OR EXISTS(SELECT 1 FROM icare_secure.dbo.Dealer_Centers l WITH(HOLDLOCK) WHERE l.dealer_id=a.dealer_id AND l.center_id=c.center_id AND l.center_type=c.type)))`,
      );
    if (result.recordset.length !== 1) throw missing();
    assertPermission(actor, permission, ref);
    return store.transaction(() => action(actor, ref));
  } finally {
    await tx.rollback().catch(() => undefined);
  }
}
function asset(row: Row, ref: CenterRef): BrandingAsset {
  return {
    id: String(row.id),
    kind: brandingKindSchema.parse(row.kind),
    url: `/api/centers/${ref.type}/${ref.id}/branding/assets/${row.id}`,
    width: Number(row.width),
    height: Number(row.height),
    bytes: Number(row.bytes),
    mime: row.mime as BrandingAsset['mime'],
    createdAt: Number(row.created_at),
    expiresAt: row.expires_at == null ? null : Number(row.expires_at),
  };
}
function current(actor: PortalActor, ref: CenterRef): CenterBranding {
  const rows = getStore()
    .db.prepare(
      'SELECT s.kind,s.version,a.id,a.mime,a.width,a.height,a.bytes,a.created_at,a.expires_at FROM branding_slots s JOIN branding_assets a ON a.id=s.asset_id AND a.mode=s.mode AND a.center_id=s.center_id AND a.center_type=s.center_type AND a.kind=s.kind WHERE s.mode=? AND s.center_id=? AND s.center_type=? ORDER BY s.kind',
    )
    .all(actor.mode, ref.id, ref.type);
  return {
    center: ref,
    storage: 'portal-private',
    logo: rows.find((r) => r.kind === 'logo')
      ? asset(
          rows.find((r) => r.kind === 'logo')!,
          ref,
        )
      : null,
    photo: rows.find((r) => r.kind === 'photo')
      ? asset(
          rows.find((r) => r.kind === 'photo')!,
          ref,
        )
      : null,
    revision: digest(JSON.stringify(rows.map((r) => [r.kind, r.id, r.version]))),
    canManage: available(actor),
  };
}
export function getBranding(actor: PortalActor, ref: CenterRef) {
  return scoped(actor, ref, 'centers.branding.read', current);
}
export async function prepareBrandingUpload(actor: PortalActor, ref: CenterRef) {
  await scoped(actor, ref, 'centers.branding.write', (actual) => {
    assertWrites(actual);
  });
  consumeBrandingUploadLimit(actor);
}
// Expiry cleanup is limited to this mode/center, and can never remove a current image.
function purge(actor: PortalActor, ref: CenterRef) {
  purgeExpiredBrandingPreviews(actor);
  getStore()
    .db.prepare(
      "DELETE FROM branding_assets WHERE mode=? AND center_id=? AND center_type=? AND state<>'published' AND expires_at<=? AND NOT EXISTS(SELECT 1 FROM branding_slots s WHERE s.asset_id=branding_assets.id)",
    )
    .run(actor.mode, ref.id, ref.type, Date.now());
}
export async function stageBranding(
  actor: PortalActor,
  ref: CenterRef,
  kind: BrandingKind,
  bytes: Buffer,
  mime: string,
  extension: string,
) {
  brandingKindSchema.parse(kind);
  assertWrites(actor);
  // Validate scope before expensive decoding, then repeat it before storing the normalized bytes.
  await scoped(actor, ref, 'centers.branding.write', () => undefined);
  const image = await normalizeImage(bytes, kind, mime, extension);
  return scoped(actor, ref, 'centers.branding.write', (actual, ref) => {
    assertWrites(actual);
    purge(actual, ref);
    const store = getStore();
    const staged = store.db
      .prepare(
        "SELECT (SELECT COUNT(*) FROM branding_assets WHERE mode=? AND actor_id=? AND state='staged')+(SELECT COUNT(*) FROM draft_images WHERE mode=? AND dealer_id=? AND state='staged') AS n",
      )
      .get(actual.mode, actual.dealerId, actual.mode, actual.dealerId);
    const center = store.db
      .prepare(
        'SELECT COALESCE(SUM(bytes),0) AS bytes FROM branding_assets WHERE mode=? AND center_id=? AND center_type=?',
      )
      .get(actual.mode, ref.id, ref.type);
    const total = store.db
      .prepare(
        'SELECT (SELECT COALESCE(SUM(bytes),0) FROM branding_assets)+(SELECT COALESCE(SUM(bytes),0) FROM draft_images) AS bytes',
      )
      .get();
    if (
      Number(staged?.n) >= 4 ||
      Number(center?.bytes) + image.bytes > 64 * 1024 * 1024 ||
      Number(total?.bytes) + image.bytes > 512 * 1024 * 1024
    )
      throw new PortalError(
        409,
        'IMAGE_STORAGE_LIMIT',
        'Image storage is full. Discard unused previews or ask an administrator to review retention.',
      );
    const id = randomUUID(),
      now = Date.now();
    store.db
      .prepare("INSERT INTO branding_assets VALUES(?,?,?,?,?,?,?,?,?,?,?,'staged',?,?)")
      .run(
        id,
        actual.mode,
        actual.dealerId,
        ref.id,
        ref.type,
        kind,
        image.mime,
        image.width,
        image.height,
        image.bytes,
        image.data,
        now,
        now + BRANDING_STAGE_MS,
      );
    return asset(
      store.db
        .prepare(
          'SELECT id,kind,mime,width,height,bytes,created_at,expires_at FROM branding_assets WHERE id=?',
        )
        .get(id)!,
      ref,
    );
  });
}
export async function publishBranding(actor: PortalActor, ref: CenterRef, value: BrandingPublish) {
  const input = brandingPublishSchema.parse(value);
  return scoped(actor, ref, 'centers.branding.write', (actual, ref) => {
    assertWrites(actual);
    const store = getStore(),
      before = current(actual, ref);
    if (before.revision !== input.revision)
      throw new PortalError(
        409,
        'BRANDING_CONFLICT',
        'Branding changed while you were reviewing. Reload the current images before saving.',
      );
    const selected: Row[] = [];
    for (const kind of ['logo', 'photo'] as const) {
      const id = input[kind];
      if (!id) continue;
      const row = store.db
        .prepare(
          "SELECT id,kind FROM branding_assets WHERE id=? AND mode=? AND actor_id=? AND center_id=? AND center_type=? AND kind=? AND state='staged' AND expires_at>?",
        )
        .get(id, actual.mode, actual.dealerId, ref.id, ref.type, kind, Date.now());
      if (!row)
        throw new PortalError(
          409,
          'PREVIEW_UNAVAILABLE',
          'A preview expired or is unavailable. Select the image again.',
        );
      selected.push(row);
    }
    for (const row of selected) {
      const previous = store.db
        .prepare(
          'SELECT asset_id FROM branding_slots WHERE mode=? AND center_id=? AND center_type=? AND kind=?',
        )
        .get(actual.mode, ref.id, ref.type, String(row.kind));
      if (previous)
        store.db
          .prepare("UPDATE branding_assets SET state='retired',expires_at=? WHERE id=?")
          .run(Date.now() + BRANDING_RETENTION_MS, String(previous.asset_id));
      store.db
        .prepare("UPDATE branding_assets SET state='published',expires_at=NULL WHERE id=?")
        .run(String(row.id));
      store.db
        .prepare(
          'INSERT INTO branding_slots VALUES(?,?,?,?,?,1) ON CONFLICT(mode,center_id,center_type,kind) DO UPDATE SET asset_id=excluded.asset_id,version=version+1',
        )
        .run(actual.mode, ref.id, ref.type, String(row.kind), String(row.id));
    }
    const after = current(actual, ref);
    store.db
      .prepare('INSERT INTO branding_operations VALUES(?,?,?,?,?,?,?,?)')
      .run(
        randomUUID(),
        actual.mode,
        actual.dealerId,
        ref.id,
        ref.type,
        JSON.stringify({ logo: before.logo?.id ?? null, photo: before.photo?.id ?? null }),
        JSON.stringify({ logo: after.logo?.id ?? null, photo: after.photo?.id ?? null }),
        Date.now(),
      );
    return after;
  });
}
export async function discardBranding(actor: PortalActor, ref: CenterRef, id: string) {
  z.uuid().parse(id);
  return scoped(actor, ref, 'centers.branding.write', (actual, ref) => {
    assertWrites(actual);
    const changed = getStore()
      .db.prepare(
        "DELETE FROM branding_assets WHERE id=? AND mode=? AND actor_id=? AND center_id=? AND center_type=? AND state='staged' AND NOT EXISTS(SELECT 1 FROM branding_slots s WHERE s.asset_id=branding_assets.id)",
      )
      .run(id, actual.mode, actual.dealerId, ref.id, ref.type);
    if (changed.changes !== 1) throw missing();
    return { ok: true };
  });
}
export async function readBrandingImage(actor: PortalActor, ref: CenterRef, id: string) {
  z.uuid().parse(id);
  return scoped(actor, ref, 'centers.branding.read', (actual, ref) => {
    const row = getStore()
      .db.prepare(
        `SELECT a.data,a.mime,a.kind FROM branding_assets a WHERE a.id=? AND a.mode=? AND a.center_id=? AND a.center_type=? AND ((a.state='staged' AND a.actor_id=? AND a.expires_at>?) OR (a.state='published' AND EXISTS(SELECT 1 FROM branding_slots s WHERE s.asset_id=a.id AND s.mode=a.mode AND s.center_id=a.center_id AND s.center_type=a.center_type AND s.kind=a.kind)))`,
      )
      .get(id, actual.mode, ref.id, ref.type, actual.dealerId, Date.now());
    if (!row) throw missing();
    return {
      data: Buffer.from(row.data as Uint8Array),
      mime: String(row.mime),
      kind: String(row.kind),
    };
  });
}
