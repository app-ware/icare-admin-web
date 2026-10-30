import 'server-only';
import sql from 'mssql';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import {
  assertPermission,
  hasPermission,
  centerGrants,
  AccessDeniedError,
  type Permission,
  type PortalActor,
} from '@/domain/access';
import { centerKey, centerRefSchema, type CenterRef } from '@/domain/centers';
import {
  inputModeChangeSchema,
  resolveInputMode,
  type InputModeChange,
  type CenterInputMode,
  type InputChoice,
  type InputRow,
  type QrJob,
} from '@/domain/input-mode';
import { demoDealer } from '@/server/auth/dealers';
import { previewDealerDetail } from '@/server/dealers/preview';
import { getPool } from '@/server/db/pools';
import { getStore, digest } from '@/server/store';
import { inputModeWritesEnabled } from '@/server/runtime';
import { PortalError } from '@/server/http';

export const inputConflict = () =>
  new PortalError(
    409,
    'REVISION_CONFLICT',
    'The input mode or watermark changed. Reload before continuing.',
  );
const missing = () =>
  new PortalError(404, 'SETTINGS_NOT_FOUND', 'This center is unavailable or outside your access.');
const catalog = (ref: CenterRef) => (ref.type === 4 ? 'icare_school' : 'icare');
const scope = (locked: boolean) =>
  `EXISTS(SELECT 1 FROM icare_secure.dbo.Dealers a ${locked ? 'WITH(UPDLOCK,HOLDLOCK)' : ''} WHERE a.dealer_id=@actor AND a.is_active=1 AND (a.is_super_admin=1 OR EXISTS(SELECT 1 FROM icare_secure.dbo.Dealer_Centers l ${locked ? 'WITH(UPDLOCK,HOLDLOCK)' : ''} WHERE l.dealer_id=a.dealer_id AND l.center_id=c.center_id AND l.center_type=c.type)))`;
export function previewScope(
  actor: PortalActor,
  input: CenterRef,
  permission: Permission,
): PortalActor {
  const ref = centerRefSchema.parse(input);
  assertPermission(actor, permission, ref);
  if (actor.mode !== 'preview') throw new AccessDeniedError();
  const identity = previewDealerDetail(getStore(), actor.dealerId);
  if (!identity?.active) throw new AccessDeniedError();
  const current = {
    ...actor,
    isSuperAdmin: identity.isSuperAdmin,
    grants: centerGrants(identity.isSuperAdmin, identity.centers.map(centerKey)),
  };
  assertPermission(current, permission, ref);
  if (
    !getStore()
      .db.prepare('SELECT 1 FROM preview_centers WHERE id=? AND type=?')
      .get(ref.id, ref.type)
  )
    throw missing();
  return current;
}
export function watermarkRow(actor: PortalActor, ref: CenterRef) {
  return getStore()
    .db.prepare(
      `SELECT a.id,a.data FROM branding_slots s JOIN branding_assets a ON a.id=s.asset_id AND a.mode=s.mode AND a.center_id=s.center_id AND a.center_type=s.center_type AND a.kind=s.kind WHERE s.mode=? AND s.center_id=? AND s.center_type=? AND s.kind='watermark' AND a.state='published'`,
    )
    .get(actor.mode, ref.id, ref.type);
}
export function jobDto(actor: PortalActor, ref: CenterRef, id: string): QrJob {
  const row = getStore()
    .db.prepare(
      'SELECT * FROM qr_jobs WHERE id=? AND mode=? AND actor_id=? AND center_id=? AND center_type=? AND expires_at>?',
    )
    .get(id, actor.mode, actor.dealerId, ref.id, ref.type, Date.now());
  if (!row)
    throw new PortalError(404, 'QR_JOB_NOT_FOUND', 'This QR job is unavailable or expired.');
  const items = getStore()
    .db.prepare('SELECT id,ordinal,state FROM qr_items WHERE job_id=? ORDER BY ordinal')
    .all(id);
  return {
    id,
    state: row.state as QrJob['state'],
    createdAt: Number(row.created_at),
    expiresAt: Number(row.expires_at),
    useWatermark: row.watermark_id != null,
    total: items.length,
    ready: items.filter((i) => i.state === 'ready').length,
    failed: items.filter((i) => i.state === 'failed').length,
    pending: items.filter((i) => i.state === 'pending' || i.state === 'rendering').length,
    items: items.map((i) => ({
      id: String(i.id),
      label: `Fictional child ${i.ordinal}`,
      state: i.state as QrJob['items'][number]['state'],
      imageUrl:
        i.state === 'ready' && row.state !== 'cancelled'
          ? `/api/centers/${ref.type}/${ref.id}/input-mode/qr/${id}/images/${i.id}`
          : null,
    })),
  };
}
function latestJob(actor: PortalActor, ref: CenterRef) {
  const row = getStore()
    .db.prepare(
      "SELECT id FROM qr_jobs WHERE mode=? AND actor_id=? AND center_id=? AND center_type=? AND expires_at>? AND state<>'cancelled' ORDER BY created_at DESC,id DESC LIMIT 1",
    )
    .get(actor.mode, actor.dealerId, ref.id, ref.type, Date.now());
  return row ? jobDto(actor, ref, String(row.id)) : null;
}
function modeDetail(
  actor: PortalActor,
  ref: CenterRef,
  rows: InputRow[],
  choices: InputChoice[],
): CenterInputMode {
  const state = resolveInputMode(rows, choices, ref.id),
    mark = watermarkRow(actor, ref);
  const version =
    getStore()
      .db.prepare(
        'SELECT version FROM input_mode_versions WHERE mode=? AND center_id=? AND center_type=?',
      )
      .get(actor.mode, ref.id, ref.type)?.version ?? 0;
  return {
    center: ref,
    ...state,
    choices: choices.filter((c) => c.enabled),
    revision: digest(JSON.stringify([rows, choices, version, mark?.id ?? null])),
    canChange:
      hasPermission(actor, 'centers.settings.write', ref) &&
      (actor.mode === 'preview' || inputModeWritesEnabled()) &&
      !state.issues.length,
    canGenerate:
      hasPermission(actor, 'centers.qr.manage', ref) &&
      actor.mode === 'preview' &&
      !state.issues.length,
    mode: actor.mode,
    watermarkAvailable: Boolean(mark),
    job: actor.mode === 'preview' ? latestJob(actor, ref) : null,
  };
}
export function previewMode(actor: PortalActor, ref: CenterRef): CenterInputMode {
  actor = previewScope(actor, ref, 'centers.settings.read');
  const row = getStore()
    .db.prepare('SELECT input_type FROM preview_input_modes WHERE center_id=? AND center_type=?')
    .get(ref.id, ref.type);
  return modeDetail(
    actor,
    ref,
    [
      { id: 1, centerId: -1, inputType: 1 },
      ...(row ? [{ id: 2, centerId: ref.id, inputType: Number(row.input_type) }] : []),
    ],
    [
      { id: 1, label: 'Manual entry (demo)', enabled: true },
      { id: 2, label: 'Card (demo)', enabled: true },
      { id: 3, label: 'QR code (demo)', enabled: true },
    ],
  );
}
function request(parent: sql.ConnectionPool | sql.Transaction, actor: PortalActor, ref: CenterRef) {
  return (parent instanceof sql.Transaction ? new sql.Request(parent) : parent.request())
    .input('actor', sql.Int, actor.dealerId)
    .input('center', sql.Int, ref.id)
    .input('type', sql.Int, ref.type);
}
export async function readLiveInputMode(
  actor: PortalActor,
  ref: CenterRef,
  parent: sql.ConnectionPool | sql.Transaction,
  locked = false,
) {
  assertPermission(actor, 'centers.settings.read', ref);
  const db = catalog(ref),
    hint = locked ? 'WITH(UPDLOCK,HOLDLOCK)' : '';
  const result = await request(parent, actor, ref).query(`
    SELECT c.center_id FROM ${db}.dbo.Care_Center c ${hint} WHERE c.center_id=@center AND c.type=@type AND ${scope(locked)};
    SELECT TOP(101) ID,center_id,input_type_id FROM ${db}.dbo.Center_Child_Input_Type ${hint} WHERE center_id IN(-1,@center) ORDER BY center_id,ID;
    SELECT TOP(101) input_type_id,input_type_desc,is_enabled FROM ${db}.dbo.Input_Type ${hint} ORDER BY input_type_id,input_type_desc;`);
  const sets = result.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  if (sets[0].length !== 1) throw missing();
  return modeDetail(
    actor,
    ref,
    sets[1].map((r) => ({
      id: Number(r.ID),
      centerId: Number(r.center_id),
      inputType: r.input_type_id == null ? null : Number(r.input_type_id),
    })),
    sets[2].map((r) => ({
      id: Number(r.input_type_id),
      label: String(r.input_type_desc ?? ''),
      enabled: r.is_enabled === true || r.is_enabled === 1,
    })),
  );
}
export async function getInputMode(actor: PortalActor, input: CenterRef): Promise<CenterInputMode> {
  const ref = centerRefSchema.parse(input);
  assertPermission(actor, 'centers.settings.read', ref);
  if (actor.mode === 'preview') {
    demoDealer(actor.dealerId);
    return getStore().transaction(() => previewMode(actor, ref));
  }
  return readLiveInputMode(actor, ref, await getPool('secure'));
}
export function validateInputChange(current: CenterInputMode, change: InputModeChange) {
  if (current.revision !== change.revision) throw inputConflict();
  if (current.issues.length)
    throw new PortalError(
      409,
      'INPUT_MODE_REVIEW',
      'Input-mode settings or references need review before editing.',
    );
  if (change.action === 'inherit' && current.source !== 'override')
    throw new PortalError(
      409,
      'ALREADY_INHERITED',
      'This center already uses the inherited default.',
    );
  const next = change.action === 'inherit' ? current.defaultType : change.inputType;
  if (!next || !current.choices.some((c) => c.id === next))
    throw new PortalError(
      422,
      'INVALID_INPUT_MODE',
      'Choose an available input mode or a valid inherited default.',
    );
  if (next !== 3 && change.jobId)
    throw new PortalError(422, 'UNEXPECTED_QR_JOB', 'A QR job can only accompany QR mode.');
  if (next === 3 && current.mode !== 'preview')
    throw new PortalError(
      503,
      'QR_INTEGRATION_PENDING',
      'Live QR mode awaits scanner and legacy storage acceptance.',
    );
  return next;
}
function advanceVersion(actor: PortalActor, ref: CenterRef) {
  getStore()
    .db.prepare(
      'INSERT INTO input_mode_versions(mode,center_id,center_type,version) VALUES(?,?,?,1) ON CONFLICT(mode,center_id,center_type) DO UPDATE SET version=version+1',
    )
    .run(actor.mode, ref.id, ref.type);
}
export async function changeInputMode(
  actor: PortalActor,
  input: CenterRef,
  value: InputModeChange,
) {
  const ref = centerRefSchema.parse(input),
    change = inputModeChangeSchema.parse(value);
  assertPermission(actor, 'centers.settings.write', ref);
  if (actor.mode !== 'preview' && !inputModeWritesEnabled())
    throw new PortalError(
      503,
      'INPUT_MODE_WRITES_DISABLED',
      'Live input-mode changes are disabled pending integration acceptance.',
    );
  const store = getStore(),
    id = randomUUID();
  function receipt(current: CenterInputMode, next: number, state: string) {
    store.db
      .prepare(
        'INSERT INTO input_mode_operations(id,mode,actor_id,center_id,center_type,previous_type,next_type,action,state,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
      )
      .run(
        id,
        actor.mode,
        actor.dealerId,
        ref.id,
        ref.type,
        current.inputType,
        next,
        change.action,
        state,
        Date.now(),
      );
  }
  if (actor.mode === 'preview') {
    demoDealer(actor.dealerId);
    return store.transaction(() => {
      actor = previewScope(actor, ref, 'centers.settings.write');
      const current = previewMode(actor, ref),
        next = validateInputChange(current, change);
      if (next === 3) {
        assertPermission(actor, 'centers.qr.manage', ref);
        if (!change.jobId)
          throw new PortalError(
            409,
            'QR_JOB_REQUIRED',
            'Prepare and verify QR images before applying QR mode.',
          );
        const job = jobDto(actor, ref, change.jobId);
        const row = store.db.prepare('SELECT revision FROM qr_jobs WHERE id=?').get(job.id)!;
        if (
          job.state !== 'ready' ||
          job.ready !== job.total ||
          !job.total ||
          row.revision !== current.revision
        )
          throw inputConflict();
        store.db.prepare("UPDATE qr_jobs SET state='applied' WHERE id=?").run(job.id);
      }
      if (change.action === 'inherit')
        store.db
          .prepare('DELETE FROM preview_input_modes WHERE center_id=? AND center_type=?')
          .run(ref.id, ref.type);
      else
        store.db
          .prepare(
            'INSERT INTO preview_input_modes(center_id,center_type,input_type,version) VALUES(?,?,?,1) ON CONFLICT(center_id,center_type) DO UPDATE SET input_type=excluded.input_type,version=version+1',
          )
          .run(ref.id, ref.type, next);
      advanceVersion(actor, ref);
      receipt(current, next, 'committed');
      return { ...previewMode(actor, ref), receiptRecorded: true };
    });
  }
  const tx = new sql.Transaction(await getPool('secure'));
  let committing = false;
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const result = await updateLiveInputMode(actor, ref, change, tx);
    store.transaction(() => {
      advanceVersion(actor, ref);
      receipt(result.previous, result.saved.inputType!, 'unconfirmed');
    });
    committing = true;
    await tx.commit();
  } catch (error) {
    await tx.rollback().catch(() => undefined);
    if (committing)
      throw new PortalError(
        503,
        'COMMIT_UNCONFIRMED',
        'The input-mode save could not be confirmed. Reload before making another change.',
      );
    throw error;
  }
  let receiptRecorded = true;
  try {
    store.db.prepare("UPDATE input_mode_operations SET state='committed' WHERE id=?").run(id);
  } catch {
    receiptRecorded = false;
  }
  try {
    return { ...(await getInputMode(actor, ref)), receiptRecorded };
  } catch {
    throw new PortalError(
      503,
      'SAVED_RELOAD_REQUIRED',
      'The input mode was saved. Reload to view the current result.',
    );
  }
}
// Exported only for disposable transaction acceptance; the public service enforces the write gate.
export async function updateLiveInputMode(
  actor: PortalActor,
  ref: CenterRef,
  change: InputModeChange,
  tx: sql.Transaction,
) {
  assertPermission(actor, 'centers.settings.write', ref);
  const current = await readLiveInputMode(actor, ref, tx, true),
    next = validateInputChange(current, change),
    db = catalog(ref);
  const result = await request(tx, actor, ref).input('input', sql.Int, next)
    .query(`DECLARE @changed TABLE(id int);
    ${change.action === 'inherit' ? `DELETE FROM ${db}.dbo.Center_Child_Input_Type OUTPUT deleted.ID INTO @changed WHERE center_id=@center;` : `IF EXISTS(SELECT 1 FROM ${db}.dbo.Center_Child_Input_Type WHERE center_id=@center) UPDATE ${db}.dbo.Center_Child_Input_Type SET input_type_id=@input OUTPUT inserted.ID INTO @changed WHERE center_id=@center; ELSE INSERT INTO ${db}.dbo.Center_Child_Input_Type(center_id,input_type_id) OUTPUT inserted.ID INTO @changed VALUES(@center,@input);`}
    SELECT COUNT(*) AS changed FROM @changed;`);
  if (Number(result.recordset[0].changed) !== 1) throw inputConflict();
  const saved = await readLiveInputMode(actor, ref, tx, true);
  if (
    saved.issues.length ||
    saved.inputType !== next ||
    saved.source !== (change.action === 'inherit' ? 'inherited' : 'override')
  )
    throw inputConflict();
  return { previous: current, saved };
}
export const jobIdSchema = z.uuid();
