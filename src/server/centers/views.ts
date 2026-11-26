import 'server-only';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { assertCapability, AccessDeniedError, type PortalActor } from '@/domain/access';
import {
  createCenterViewSchema,
  updateCenterViewSchema,
  centerViewRevisionSchema,
  centerViewFiltersSchema,
  CENTER_VIEW_LIMIT,
  CENTER_VIEW_ARCHIVE_LIMIT,
  CENTER_VIEW_ARCHIVE_TTL,
  type SavedCenterView,
  type CenterViews,
} from '@/domain/center-views';
import { getStore, digest } from '@/server/store';
import { demoDealer } from '@/server/auth/dealers';
import { PortalError } from '@/server/http';

const missing = () =>
  new PortalError(404, 'VIEW_NOT_FOUND', 'This saved view is unavailable. Refresh your views.');
const conflict = () =>
  new PortalError(
    409,
    'VIEW_CONFLICT',
    'This view changed in another tab. Refresh your views before trying again.',
  );
function guard(actor: PortalActor, write = false) {
  assertCapability(actor, 'centers.read');
  // Live endpoints reload stored identity through requireActor; demo direct calls also check activity.
  // A preference never supplies center permissions.
  if (actor.mode === 'preview' && !demoDealer(actor.dealerId)) throw new AccessDeniedError();
  if (write && !getStore().consumeLimit(`center-views:${actor.mode}:${actor.dealerId}`, 30, 60000))
    throw new PortalError(
      429,
      'VIEW_RATE_LIMIT',
      'Wait a minute before changing another saved view.',
    );
}
function cleanup(actor: PortalActor) {
  getStore()
    .db.prepare('DELETE FROM center_views WHERE mode=? AND dealer_id=? AND removed_at<=?')
    .run(actor.mode, actor.dealerId, Date.now() - CENTER_VIEW_ARCHIVE_TTL);
}
function item(row: Record<string, unknown>): SavedCenterView {
  return {
    id: String(row.id),
    name: String(row.name),
    filters: centerViewFiltersSchema.parse(JSON.parse(String(row.filters))),
    revision: String(row.revision),
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
    removedAt: row.removed_at == null ? null : Number(row.removed_at),
  };
}
function owned(actor: PortalActor, value: string) {
  const id = z.uuid().parse(value);
  const row = getStore()
    .db.prepare('SELECT * FROM center_views WHERE id=? AND mode=? AND dealer_id=?')
    .get(id, actor.mode, actor.dealerId);
  if (!row) throw missing();
  return row;
}
function available(actor: PortalActor, name: string, except = '') {
  if (
    getStore()
      .db.prepare(
        'SELECT 1 FROM center_views WHERE mode=? AND dealer_id=? AND name_key=? AND removed_at IS NULL AND id<>?',
      )
      .get(actor.mode, actor.dealerId, name.toLowerCase(), except)
  )
    throw new PortalError(
      409,
      'VIEW_NAME_EXISTS',
      'You already have a view with this name. Choose a different name.',
    );
}
function capacity(actor: PortalActor) {
  const count = Number(
    getStore()
      .db.prepare(
        'SELECT COUNT(*) n FROM center_views WHERE mode=? AND dealer_id=? AND removed_at IS NULL',
      )
      .get(actor.mode, actor.dealerId)?.n,
  );
  if (count >= CENTER_VIEW_LIMIT)
    throw new PortalError(
      409,
      'VIEW_LIMIT',
      'You can keep up to 20 saved views. Remove a view before adding or restoring another.',
    );
}
export function listCenterViews(actor: PortalActor): CenterViews {
  guard(actor);
  return getStore().transaction(() => {
    cleanup(actor);
    const rows = getStore()
      .db.prepare(
        'SELECT * FROM center_views WHERE mode=? AND dealer_id=? ORDER BY updated_at DESC,id',
      )
      .all(actor.mode, actor.dealerId)
      .map(item);
    return {
      items: rows.filter((r) => r.removedAt === null),
      removed: rows.filter((r) => r.removedAt !== null),
    };
  });
}
export function createCenterView(actor: PortalActor, input: unknown): SavedCenterView {
  guard(actor, true);
  const data = createCenterViewSchema.parse(input);
  const fingerprint = digest(JSON.stringify({ name: data.name, filters: data.filters }));
  return getStore().transaction(() => {
    cleanup(actor);
    const existing = getStore().db.prepare('SELECT * FROM center_views WHERE id=?').get(data.id);
    if (existing) {
      if (existing.mode !== actor.mode || Number(existing.dealer_id) !== actor.dealerId)
        throw missing();
      if (existing.fingerprint !== fingerprint || existing.removed_at != null) throw conflict();
      return item(existing); // A retry cannot overwrite later edits.
    }
    capacity(actor);
    available(actor, data.name);
    if (Number(getStore().db.prepare('SELECT COUNT(*) n FROM center_views').get()?.n) >= 50000)
      throw new PortalError(
        503,
        'VIEW_STORAGE_LIMIT',
        'Saved view storage is full. Contact your administrator.',
      );
    const now = Date.now();
    getStore()
      .db.prepare('INSERT INTO center_views VALUES(?,?,?,?,?,?,?,?,?,?,NULL)')
      .run(
        data.id,
        actor.mode,
        actor.dealerId,
        data.name,
        data.name.toLowerCase(),
        JSON.stringify(data.filters),
        randomUUID(),
        fingerprint,
        now,
        now,
      );
    return item(owned(actor, data.id));
  });
}
export function updateCenterView(actor: PortalActor, id: string, input: unknown): SavedCenterView {
  guard(actor, true);
  const data = updateCenterViewSchema.parse(input);
  return getStore().transaction(() => {
    cleanup(actor);
    const row = owned(actor, id);
    if (row.revision !== data.revision || row.removed_at != null) throw conflict();
    available(actor, data.name, id);
    getStore()
      .db.prepare(
        'UPDATE center_views SET name=?,name_key=?,filters=?,revision=?,updated_at=? WHERE id=? AND mode=? AND dealer_id=?',
      )
      .run(
        data.name,
        data.name.toLowerCase(),
        JSON.stringify(data.filters),
        randomUUID(),
        Date.now(),
        id,
        actor.mode,
        actor.dealerId,
      );
    return item(owned(actor, id));
  });
}
export function removeCenterView(actor: PortalActor, id: string, input: unknown): SavedCenterView {
  guard(actor, true);
  const data = centerViewRevisionSchema.parse(input);
  return getStore().transaction(() => {
    cleanup(actor);
    const row = owned(actor, id);
    if (row.revision !== data.revision || row.removed_at != null) throw conflict();
    const now = Date.now();
    getStore()
      .db.prepare(
        'UPDATE center_views SET removed_at=?,updated_at=?,revision=? WHERE id=? AND mode=? AND dealer_id=?',
      )
      .run(now, now, randomUUID(), id, actor.mode, actor.dealerId);
    const archived = getStore()
      .db.prepare(
        'SELECT id FROM center_views WHERE mode=? AND dealer_id=? AND removed_at IS NOT NULL ORDER BY removed_at DESC,rowid DESC',
      )
      .all(actor.mode, actor.dealerId);
    for (const old of archived.slice(CENTER_VIEW_ARCHIVE_LIMIT))
      getStore()
        .db.prepare('DELETE FROM center_views WHERE id=? AND mode=? AND dealer_id=?')
        .run(String(old.id), actor.mode, actor.dealerId);
    return item(owned(actor, id));
  });
}
export function restoreCenterView(actor: PortalActor, id: string, input: unknown): SavedCenterView {
  guard(actor, true);
  const data = centerViewRevisionSchema.parse(input);
  return getStore().transaction(() => {
    cleanup(actor);
    const row = owned(actor, id);
    if (row.revision !== data.revision || row.removed_at == null) throw conflict();
    capacity(actor);
    available(actor, String(row.name), id);
    getStore()
      .db.prepare(
        'UPDATE center_views SET removed_at=NULL,updated_at=?,revision=? WHERE id=? AND mode=? AND dealer_id=?',
      )
      .run(Date.now(), randomUUID(), id, actor.mode, actor.dealerId);
    return item(owned(actor, id));
  });
}
