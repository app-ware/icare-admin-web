import 'server-only';
import { randomUUID } from 'node:crypto';
import { centerRefSchema, type CenterRef } from '@/domain/centers';
import { assertPermission, type PortalActor } from '@/domain/access';
import { qrStartSchema, qrActionSchema, type QrStart, type QrJob } from '@/domain/input-mode';
import { demoDealer } from '@/server/auth/dealers';
import { getStore, digest } from '@/server/store';
import { PortalError } from '@/server/http';
import { reserveImageUpload } from '@/server/branding/images';
import {
  inputConflict,
  jobDto,
  jobIdSchema,
  previewScope,
  previewMode,
  watermarkRow,
} from './repository';
import { renderDemoQr } from './render';

const RETENTION = 7 * 86400000;
function authorize(actor: PortalActor, ref: CenterRef) {
  centerRefSchema.parse(ref);
  assertPermission(actor, 'centers.qr.manage', ref);
  if (actor.mode !== 'preview')
    throw new PortalError(
      503,
      'QR_INTEGRATION_PENDING',
      'Live QR generation awaits scanner and legacy storage acceptance.',
    );
  return previewScope(actor, ref, 'centers.qr.manage');
}
function rowFor(actor: PortalActor, ref: CenterRef, id: string) {
  jobIdSchema.parse(id);
  jobDto(actor, ref, id);
  return getStore().db.prepare('SELECT * FROM qr_jobs WHERE id=?').get(id)!;
}
function checkRevision(actor: PortalActor, ref: CenterRef, row: Record<string, unknown>) {
  const current = previewMode(actor, ref);
  if (current.issues.length || current.revision !== row.revision) throw inputConflict();
}
export async function startQrJob(
  actor: PortalActor,
  input: CenterRef,
  value: QrStart,
): Promise<QrJob> {
  const ref = centerRefSchema.parse(input),
    change = qrStartSchema.parse(value);
  assertPermission(actor, 'centers.qr.manage', ref);
  if (actor.mode === 'preview') demoDealer(actor.dealerId);
  actor = authorize(actor, ref);
  const store = getStore(),
    fingerprint = digest(JSON.stringify([ref, change.revision, change.useWatermark]));
  return store.transaction(() => {
    actor = authorize(actor, ref);
    const previous = store.db
      .prepare('SELECT id,fingerprint FROM qr_jobs WHERE mode=? AND actor_id=? AND request_id=?')
      .get(actor.mode, actor.dealerId, change.requestId);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new PortalError(
          409,
          'REQUEST_CONFLICT',
          'This request already belongs to a different QR job.',
        );
      return jobDto(actor, ref, String(previous.id));
    }
    const current = previewMode(actor, ref);
    if (current.revision !== change.revision || current.issues.length) throw inputConflict();
    const now = Date.now();
    store.db
      .prepare('DELETE FROM qr_items WHERE job_id IN(SELECT id FROM qr_jobs WHERE expires_at<=?)')
      .run(now);
    store.db.prepare('DELETE FROM qr_jobs WHERE expires_at<=?').run(now);
    const count = Number(
      store.db
        .prepare('SELECT COUNT(*) n FROM qr_jobs WHERE mode=? AND actor_id=? AND created_at>?')
        .get(actor.mode, actor.dealerId, now - 86400000)?.n,
    );
    const active = Number(
      store.db
        .prepare(
          "SELECT COUNT(*) n FROM qr_jobs WHERE mode=? AND actor_id=? AND center_id=? AND center_type=? AND state IN('pending','running','failed','ready')",
        )
        .get(actor.mode, actor.dealerId, ref.id, ref.type)?.n,
    );
    const bytes = Number(
      store.db
        .prepare(
          'SELECT COALESCE(SUM(length(data)),0)+(SELECT COALESCE(SUM(length(watermark_data)),0) FROM qr_jobs) n FROM qr_items',
        )
        .get()?.n,
    );
    if (count >= 20 || active >= 3 || bytes > 60 * 1024 * 1024)
      throw new PortalError(
        429,
        'QR_JOB_LIMIT',
        'QR job storage or request limits were reached. Cancel old jobs or try again later.',
      );
    const watermark = change.useWatermark ? watermarkRow(actor, ref) : null;
    if (change.useWatermark && !watermark)
      throw new PortalError(
        409,
        'WATERMARK_UNAVAILABLE',
        'Publish a watermark before choosing this option.',
      );
    const snapshotBytes = watermark?.data ? (watermark.data as Uint8Array).byteLength : 0;
    if (bytes + snapshotBytes + 3 * 256 * 1024 > 64 * 1024 * 1024)
      throw new PortalError(
        429,
        'QR_JOB_LIMIT',
        'QR storage limits were reached. Cancel old jobs or try again later.',
      );
    const id = randomUUID();
    store.db
      .prepare(
        "INSERT INTO qr_jobs(id,mode,actor_id,center_id,center_type,request_id,fingerprint,revision,watermark_id,watermark_data,state,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?,?,'pending',?,?)",
      )
      .run(
        id,
        actor.mode,
        actor.dealerId,
        ref.id,
        ref.type,
        change.requestId,
        fingerprint,
        change.revision,
        watermark?.id ? String(watermark.id) : null,
        watermark?.data ?? null,
        now,
        now + RETENTION,
      );
    // Three synthetic subjects only. No live child query, identifiers or names are used.
    for (let ordinal = 1; ordinal <= 3; ordinal++) {
      store.db
        .prepare(
          'INSERT INTO preview_qr_subjects(center_id,center_type,ordinal,token) VALUES(?,?,?,?) ON CONFLICT DO NOTHING',
        )
        .run(ref.id, ref.type, ordinal, randomUUID());
      const subject = store.db
        .prepare(
          'SELECT token FROM preview_qr_subjects WHERE center_id=? AND center_type=? AND ordinal=?',
        )
        .get(ref.id, ref.type, ordinal)!;
      store.db
        .prepare("INSERT INTO qr_items(id,job_id,ordinal,payload,state) VALUES(?,?,?,?,'pending')")
        .run(randomUUID(), id, ordinal, `ICARE-DEMO:${subject.token}`);
    }
    return jobDto(actor, ref, id);
  });
}
export async function getQrJob(actor: PortalActor, input: CenterRef, id: string) {
  const ref = centerRefSchema.parse(input);
  actor = authorize(actor, ref);
  return getStore().transaction(() => {
    authorize(actor, ref);
    return jobDto(actor, ref, jobIdSchema.parse(id));
  });
}
export async function actOnQrJob(
  actor: PortalActor,
  input: CenterRef,
  id: string,
  value: { action: 'advance' | 'retry' | 'cancel' },
): Promise<QrJob> {
  const ref = centerRefSchema.parse(input),
    { action } = qrActionSchema.parse(value);
  actor = authorize(actor, ref);
  const store = getStore();
  if (action !== 'advance')
    return store.transaction(() => {
      authorize(actor, ref);
      const row = rowFor(actor, ref, id);
      if (row.state === 'applied' || row.state === 'cancelled')
        throw new PortalError(409, 'QR_JOB_FINISHED', 'This QR job has already finished.');
      if (action === 'cancel') {
        store.db
          .prepare("UPDATE qr_jobs SET state='cancelled',watermark_data=NULL WHERE id=?")
          .run(id);
        store.db
          .prepare('UPDATE qr_items SET data=NULL,lease=NULL,lease_until=NULL WHERE job_id=?')
          .run(id);
      } else {
        checkRevision(actor, ref, row);
        if (row.state !== 'failed')
          throw new PortalError(409, 'QR_RETRY_UNAVAILABLE', 'Only failed images can be retried.');
        const exhausted = store.db
          .prepare("SELECT 1 FROM qr_items WHERE job_id=? AND state='failed' AND attempts>=3")
          .get(id);
        if (exhausted)
          throw new PortalError(
            429,
            'QR_RETRY_LIMIT',
            'The retry limit was reached. Cancel this job and review the watermark.',
          );
        store.db
          .prepare("UPDATE qr_items SET state='pending' WHERE job_id=? AND state='failed'")
          .run(id);
        store.db.prepare("UPDATE qr_jobs SET state='running' WHERE id=?").run(id);
      }
      return jobDto(actor, ref, id);
    });
  const release = reserveImageUpload();
  try {
    const claimed = store.transaction(() => {
      authorize(actor, ref);
      const row = rowFor(actor, ref, id);
      if (row.state === 'ready' || row.state === 'applied') return null;
      if (row.state === 'cancelled' || row.state === 'failed')
        throw new PortalError(
          409,
          'QR_JOB_PAUSED',
          'Resume failed images explicitly or start a new job.',
        );
      checkRevision(actor, ref, row);
      const now = Date.now();
      // Rendering has no external side effects; expired local leases can safely resume.
      store.db
        .prepare(
          "UPDATE qr_items SET state='pending',lease=NULL WHERE job_id=? AND state='rendering' AND lease_until<=?",
        )
        .run(id, now);
      if (store.db.prepare("SELECT 1 FROM qr_items WHERE job_id=? AND state='rendering'").get(id))
        throw new PortalError(
          409,
          'QR_JOB_BUSY',
          'An image is already being prepared. Refresh the job shortly.',
        );
      const item = store.db
        .prepare(
          "SELECT id,payload FROM qr_items WHERE job_id=? AND state='pending' ORDER BY ordinal LIMIT 1",
        )
        .get(id);
      if (!item)
        throw new PortalError(409, 'QR_JOB_PAUSED', 'Refresh the current job before continuing.');
      const lease = randomUUID();
      store.db
        .prepare(
          "UPDATE qr_items SET state='rendering',lease=?,lease_until=?,attempts=attempts+1 WHERE id=?",
        )
        .run(lease, now + 60000, item.id);
      store.db.prepare("UPDATE qr_jobs SET state='running' WHERE id=?").run(id);
      return {
        item: String(item.id),
        payload: String(item.payload),
        lease,
        watermark: row.watermark_data ? Buffer.from(row.watermark_data as Uint8Array) : null,
      };
    });
    if (!claimed) return jobDto(actor, ref, id);
    let image: Buffer | null = null;
    try {
      image = await renderDemoQr(claimed.payload, claimed.watermark);
    } catch {
      /* Persist only a safe failure state, never payloads or decoder errors. */
    }
    return store.transaction(() => {
      authorize(actor, ref);
      const row = rowFor(actor, ref, id);
      if (row.state === 'cancelled') return jobDto(actor, ref, id);
      checkRevision(actor, ref, row);
      const totalBytes = Number(
        store.db
          .prepare(
            'SELECT COALESCE(SUM(length(data)),0)+(SELECT COALESCE(SUM(length(watermark_data)),0) FROM qr_jobs) n FROM qr_items',
          )
          .get()?.n,
      );
      if (image && (image.length > 256 * 1024 || totalBytes + image.length > 64 * 1024 * 1024))
        image = null;
      store.db
        .prepare(
          "UPDATE qr_items SET state=?,data=?,lease=NULL,lease_until=NULL WHERE id=? AND job_id=? AND lease=? AND state='rendering'",
        )
        .run(image ? 'ready' : 'failed', image, claimed.item, id, claimed.lease);
      const states = store.db.prepare('SELECT state FROM qr_items WHERE job_id=?').all(id);
      const state = states.every((i) => i.state === 'ready')
        ? 'ready'
        : states.some((i) => i.state === 'pending' || i.state === 'rendering')
          ? 'running'
          : 'failed';
      store.db.prepare('UPDATE qr_jobs SET state=? WHERE id=?').run(state, id);
      return jobDto(actor, ref, id);
    });
  } finally {
    release();
  }
}
export async function readQrImage(
  actor: PortalActor,
  input: CenterRef,
  id: string,
  itemId: string,
) {
  const ref = centerRefSchema.parse(input);
  jobIdSchema.parse(itemId);
  actor = authorize(actor, ref);
  return getStore().transaction(() => {
    authorize(actor, ref);
    const row = rowFor(actor, ref, id);
    if (row.state === 'cancelled')
      throw new PortalError(404, 'QR_IMAGE_UNAVAILABLE', 'This QR image is unavailable.');
    const item = getStore()
      .db.prepare("SELECT data FROM qr_items WHERE id=? AND job_id=? AND state='ready'")
      .get(itemId, id);
    if (!item?.data)
      throw new PortalError(404, 'QR_IMAGE_UNAVAILABLE', 'This QR image is unavailable.');
    return Buffer.from(item.data as Uint8Array);
  });
}
