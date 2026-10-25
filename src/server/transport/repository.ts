import 'server-only';
import sql from 'mssql';
import { randomUUID } from 'node:crypto';
import {
  assertCapability,
  assertPermission,
  AccessDeniedError,
  centerGrants,
  type PortalActor,
} from '@/domain/access';
import { centerKey, type CenterRef } from '@/domain/centers';
import {
  busChangeSchema,
  busIdSchema,
  transportRefSchema,
  transportQuerySchema,
  resolveBusSettings,
  referencesValid,
  valuesValid,
  type BusChange,
  type BusDetail,
  type BusReferences,
  type BusRow,
  type BusValues,
  type CenterBuses,
  type TransportDirectory,
  type TransportQuery,
} from '@/domain/transport';
import { demoDealer } from '@/server/auth/dealers';
import { previewDealerDetail } from '@/server/dealers/preview';
import { listCenters } from '@/server/centers/repository';
import { getPool } from '@/server/db/pools';
import { getStore, digest } from '@/server/store';
import { transportWritesEnabled } from '@/server/runtime';
import { PortalError } from '@/server/http';

const catalog = (ref: CenterRef) => (ref.type === 4 ? 'icare_school' : 'icare');
const missing = () =>
  new PortalError(404, 'BUS_NOT_FOUND', 'The center or bus is unavailable or outside your access.');
const conflict = () =>
  new PortalError(
    409,
    'REVISION_CONFLICT',
    'The bus settings or reference choices changed. Reload before saving.',
  );
function currentPreview(actor: PortalActor, seed = true) {
  if (seed) demoDealer(actor.dealerId);
  const identity = previewDealerDetail(getStore(), actor.dealerId);
  if (!identity?.active) throw new AccessDeniedError();
  return {
    ...actor,
    isSuperAdmin: identity.isSuperAdmin,
    grants: centerGrants(identity.isSuperAdmin, identity.centers.map(centerKey)),
  };
}
function available(actor: PortalActor) {
  return actor.mode === 'preview' || transportWritesEnabled();
}
function version(actor: PortalActor, ref: CenterRef, busId: number) {
  return Number(
    getStore()
      .db.prepare(
        'SELECT version FROM bus_versions WHERE mode=? AND center_id=? AND center_type=? AND bus_id=?',
      )
      .get(actor.mode, ref.id, ref.type, busId)?.version ?? 0,
  );
}
function advance(actor: PortalActor, ref: CenterRef, busId: number) {
  getStore()
    .db.prepare(
      'INSERT INTO bus_versions(mode,center_id,center_type,bus_id,version) VALUES(?,?,?,?,1) ON CONFLICT(mode,center_id,center_type,bus_id) DO UPDATE SET version=version+1',
    )
    .run(actor.mode, ref.id, ref.type, busId);
}
function detail(
  actor: PortalActor,
  center: BusDetail['center'],
  bus: BusDetail['bus'],
  rows: BusRow[],
  references: BusReferences,
): BusDetail {
  const state = resolveBusSettings(rows, bus.id, references);
  return {
    center,
    bus,
    ...state,
    references,
    revision: digest(
      JSON.stringify([center, bus, rows, references, version(actor, center, bus.id)]),
    ),
    canManage: available(actor) && state.issues.length === 0,
  };
}
export async function listTransportCenters(
  actor: PortalActor,
  input: TransportQuery,
): Promise<TransportDirectory> {
  assertCapability(actor, 'transport.manage');
  const query = transportQuerySchema.parse(input);
  if (actor.mode === 'preview') actor = currentPreview(actor);
  assertCapability(actor, 'transport.manage');
  const result = await listCenters(actor, { ...query, status: 'all', sort: 'name' });
  return {
    ...result,
    items: result.items.map((c) => ({ id: c.id, type: c.type, name: c.profile.name })),
    writesEnabled: available(actor),
  };
}
const scope = `EXISTS(SELECT 1 FROM icare_secure.dbo.Dealers a WHERE a.dealer_id=@actor AND a.is_active=1 AND (a.is_super_admin=1 OR EXISTS(SELECT 1 FROM icare_secure.dbo.Dealer_Centers l WHERE l.dealer_id=a.dealer_id AND l.center_id=c.center_id AND l.center_type=c.type)))`;
const lockedScope = `EXISTS(SELECT 1 FROM icare_secure.dbo.Dealers a WITH(UPDLOCK,HOLDLOCK) WHERE a.dealer_id=@actor AND a.is_active=1 AND (a.is_super_admin=1 OR EXISTS(SELECT 1 FROM icare_secure.dbo.Dealer_Centers l WITH(UPDLOCK,HOLDLOCK) WHERE l.dealer_id=a.dealer_id AND l.center_id=c.center_id AND l.center_type=c.type)))`;
function request(pool: sql.ConnectionPool | sql.Transaction, actor: PortalActor, ref: CenterRef) {
  return (pool instanceof sql.Transaction ? new sql.Request(pool) : pool.request())
    .input('actor', sql.Int, actor.dealerId)
    .input('center', sql.Int, ref.id)
    .input('type', sql.Int, ref.type);
}
function previewCenter(actor: PortalActor, ref: CenterRef) {
  assertPermission(actor, 'transport.manage', ref);
  const c = getStore()
    .db.prepare('SELECT profile FROM preview_centers WHERE id=? AND type=?')
    .get(ref.id, ref.type);
  if (!c) throw missing();
  return { ...ref, name: String(JSON.parse(String(c.profile)).name) };
}
export async function listBuses(actor: PortalActor, input: CenterRef): Promise<CenterBuses> {
  const ref = transportRefSchema.parse(input);
  assertPermission(actor, 'transport.manage', ref);
  if (actor.mode === 'preview') {
    actor = currentPreview(actor);
    const center = previewCenter(actor, ref);
    return {
      center,
      items: [
        { id: 1, name: 'Fictional morning bus' },
        { id: 2, name: 'Fictional afternoon bus' },
      ],
      writesEnabled: true,
    };
  }
  const db = catalog(ref),
    pool = await getPool('secure');
  const r = await request(pool, actor, ref)
    .query(`SELECT c.center_id,c.center_name FROM ${db}.dbo.Care_Center c WHERE c.center_id=@center AND c.type=@type AND ${scope};
 SELECT TOP(501) b.bus_type_id,b.bus_name FROM ${db}.dbo.Bus_Type b JOIN ${db}.dbo.Care_Center c ON c.center_id=b.center_id WHERE c.center_id=@center AND c.type=@type AND ${scope} ORDER BY b.bus_name,b.bus_type_id;`);
  const sets = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  if (sets[0].length !== 1) throw missing();
  if (sets[1].length > 500)
    throw new PortalError(
      422,
      'BUS_LIMIT',
      'This center has too many buses to load. Contact your administrator.',
    );
  return {
    center: { ...ref, name: String(sets[0][0].center_name) },
    items: sets[1]
      .map((b) => ({
        id: Number(b.bus_type_id),
        name: String(b.bus_name ?? `Bus ${b.bus_type_id}`),
      }))
      .filter((b) => busIdSchema.safeParse(b.id).success),
    writesEnabled: available(actor),
  };
}
// Fictional, explicitly labeled choices. They never become live lookup seeds.
const demoReferences = (ref: CenterRef): BusReferences => ({
  radius: [
    {
      id: 1,
      label: ref.type === 4 ? '75 metres (demo)' : '50 metres (demo)',
      value: ref.type === 4 ? 75 : 50,
    },
    { id: 2, label: '100 metres (demo)', value: 100 },
  ],
  dwell: [
    { id: 1, label: '30 seconds (demo)', value: 30 },
    { id: 2, label: '60 seconds (demo)', value: 60 },
  ],
  input: [
    { id: 1, label: 'Manual (demo)', value: null },
    { id: 2, label: 'QR code (demo)', value: null },
  ],
});
function previewDetail(actor: PortalActor, ref: CenterRef, busId: number) {
  const center = previewCenter(actor, ref);
  if (![1, 2].includes(busId)) throw missing();
  const rows: BusRow[] = [{ id: -1, busId: -1, radius: 1, dwell: 1, input: 1 }];
  const own = getStore()
    .db.prepare(
      'SELECT values_json FROM preview_bus_settings WHERE center_id=? AND center_type=? AND bus_id=?',
    )
    .get(ref.id, ref.type, busId);
  if (own) rows.push({ id: busId, busId, ...(JSON.parse(String(own.values_json)) as BusValues) });
  return detail(
    actor,
    center,
    { id: busId, name: busId === 1 ? 'Fictional morning bus' : 'Fictional afternoon bus' },
    rows,
    demoReferences(ref),
  );
}
export async function getBusInTransaction(
  actor: PortalActor,
  ref: CenterRef,
  busId: number,
  parent: sql.ConnectionPool | sql.Transaction,
  locked = false,
): Promise<BusDetail> {
  assertPermission(actor, 'transport.manage', ref);
  const db = catalog(ref),
    hint = locked ? 'WITH(UPDLOCK,HOLDLOCK)' : '';
  const r = await request(parent, actor, ref).input('bus', sql.Int, busId).query(`
 SELECT c.center_name,b.bus_name,b.bus_type_id FROM ${db}.dbo.Care_Center c ${hint} JOIN ${db}.dbo.Bus_Type b ${hint} ON b.center_id=c.center_id WHERE c.center_id=@center AND c.type=@type AND b.bus_type_id=@bus AND ${locked ? lockedScope : scope};
 SELECT TOP(201) bus_settings_id,bus_id,geofence_raduis,dwell_duration,passenger_input_type FROM ${db}.dbo.Bus_Settings ${hint} WHERE bus_id IN(-1,@bus) ORDER BY bus_id,bus_settings_id;
 SELECT TOP(101) dwell_duration_id,duration_value,duration_text FROM ${db}.dbo.DwellDuration_Values ${hint} ORDER BY duration_value,dwell_duration_id;
 SELECT TOP(101) geofence_raduis_id,raduis_value,raduis_text FROM ${db}.dbo.GeofenceRaduis_Values ${hint} ORDER BY raduis_value,geofence_raduis_id;
 SELECT TOP(101) input_type_id,input_type_desc FROM ${db}.dbo.Input_Type ${hint} WHERE is_enabled=1 ORDER BY input_type_id,input_type_desc;
 `);
  const sets = r.recordsets as sql.IRecordSet<Record<string, unknown>>[];
  if (sets[0].length !== 1) throw missing();
  const nullable = (n: unknown) => (n == null ? null : Number(n));
  const rows = sets[1].map((s) => ({
    id: Number(s.bus_settings_id),
    busId: Number(s.bus_id),
    radius: nullable(s.geofence_raduis),
    dwell: nullable(s.dwell_duration),
    input: nullable(s.passenger_input_type),
  }));
  const references: BusReferences = {
    dwell: sets[2].map((s) => ({
      id: Number(s.dwell_duration_id),
      value: nullable(s.duration_value),
      label: String(s.duration_text ?? ''),
    })),
    radius: sets[3].map((s) => ({
      id: Number(s.geofence_raduis_id),
      value: nullable(s.raduis_value),
      label: String(s.raduis_text ?? ''),
    })),
    input: sets[4].map((s) => ({
      id: Number(s.input_type_id),
      value: null,
      label: String(s.input_type_desc ?? ''),
    })),
  };
  return detail(
    actor,
    { ...ref, name: String(sets[0][0].center_name) },
    { id: busId, name: String(sets[0][0].bus_name ?? `Bus ${busId}`) },
    rows,
    references,
  );
}
export async function getBus(actor: PortalActor, input: CenterRef, id: number): Promise<BusDetail> {
  const ref = transportRefSchema.parse(input),
    busId = busIdSchema.parse(id);
  assertPermission(actor, 'transport.manage', ref);
  if (actor.mode === 'preview') return previewDetail(currentPreview(actor), ref, busId);
  return getBusInTransaction(actor, ref, busId, await getPool('secure'));
}
function validateChange(current: BusDetail, change: BusChange) {
  if (current.revision !== change.revision) throw conflict();
  if (current.issues.length || !referencesValid(current.references))
    throw new PortalError(
      409,
      'SETTINGS_REVIEW',
      'Settings or reference choices need review before editing.',
    );
  if (change.action === 'inherit' && !current.canInherit)
    throw new PortalError(409, 'DEFAULT_UNAVAILABLE', 'A valid inherited default is required.');
  if (change.action === 'override' && !valuesValid(change, current.references))
    throw new PortalError(
      422,
      'INVALID_CHOICE',
      'Choose one of the current catalog options for each setting.',
    );
}
export async function updateBusInTransaction(
  actor: PortalActor,
  ref: CenterRef,
  busId: number,
  change: BusChange,
  tx: sql.Transaction,
) {
  const current = await getBusInTransaction(actor, ref, busId, tx, true);
  validateChange(current, change);
  const db = catalog(ref),
    req = request(tx, actor, ref).input('bus', sql.Int, busId);
  let result: sql.IResult<unknown>;
  if (change.action === 'inherit')
    result = await req.query(
      `DECLARE @changed TABLE(id int); DELETE FROM ${db}.dbo.Bus_Settings OUTPUT deleted.bus_settings_id INTO @changed WHERE bus_id=@bus; SELECT COUNT(*) AS changed FROM @changed;`,
    );
  else
    result = await req
      .input('radius', sql.Int, change.radius)
      .input('dwell', sql.Int, change.dwell)
      .input('input', sql.Int, change.input)
      .query(
        `DECLARE @changed TABLE(id int); IF EXISTS(SELECT 1 FROM ${db}.dbo.Bus_Settings WHERE bus_id=@bus) UPDATE ${db}.dbo.Bus_Settings SET geofence_raduis=@radius,dwell_duration=@dwell,passenger_input_type=@input OUTPUT inserted.bus_settings_id INTO @changed WHERE bus_id=@bus; ELSE INSERT INTO ${db}.dbo.Bus_Settings(bus_id,geofence_raduis,dwell_duration,passenger_input_type) OUTPUT inserted.bus_settings_id INTO @changed VALUES(@bus,@radius,@dwell,@input); SELECT COUNT(*) AS changed FROM @changed;`,
      );
  if (Number((result.recordset[0] as { changed: number }).changed) !== 1) throw conflict();
  const saved = await getBusInTransaction(actor, ref, busId, tx, true);
  if (
    saved.issues.length ||
    (change.action === 'inherit'
      ? saved.source !== 'inherited'
      : saved.source !== 'override' ||
        !(['radius', 'dwell', 'input'] as const).every((k) => saved.values?.[k] === change[k]))
  )
    throw conflict();
  return saved;
}
export async function changeBus(
  actor: PortalActor,
  input: CenterRef,
  id: number,
  value: BusChange,
): Promise<BusDetail & { receiptRecorded: boolean }> {
  const ref = transportRefSchema.parse(input),
    busId = busIdSchema.parse(id),
    change = busChangeSchema.parse(value);
  assertPermission(actor, 'transport.manage', ref);
  if (!available(actor))
    throw new PortalError(
      503,
      'WRITES_DISABLED',
      'Live bus changes are disabled pending reference review and acceptance.',
    );
  const store = getStore(),
    operation = randomUUID();
  const intent = () =>
    store.transaction(() => {
      advance(actor, ref, busId);
      store.db
        .prepare(
          "INSERT INTO bus_operations(id,mode,actor_id,center_id,center_type,bus_id,action,state,created_at) VALUES(?,?,?,?,?,?,?,'unconfirmed',?)",
        )
        .run(
          operation,
          actor.mode,
          actor.dealerId,
          ref.id,
          ref.type,
          busId,
          change.action,
          Date.now(),
        );
    });
  const confirmed = () => {
    store.db
      .prepare("UPDATE bus_operations SET state='committed',completed_at=? WHERE id=?")
      .run(Date.now(), operation);
  };
  if (actor.mode === 'preview') {
    actor = currentPreview(actor);
    return store.transaction(() => {
      actor = currentPreview(actor, false);
      const current = previewDetail(actor, ref, busId);
      validateChange(current, change);
      if (change.action === 'inherit')
        store.db
          .prepare(
            'DELETE FROM preview_bus_settings WHERE center_id=? AND center_type=? AND bus_id=?',
          )
          .run(ref.id, ref.type, busId);
      else
        store.db
          .prepare(
            'INSERT INTO preview_bus_settings(center_id,center_type,bus_id,values_json) VALUES(?,?,?,?) ON CONFLICT(center_id,center_type,bus_id) DO UPDATE SET values_json=excluded.values_json',
          )
          .run(
            ref.id,
            ref.type,
            busId,
            JSON.stringify({ radius: change.radius, dwell: change.dwell, input: change.input }),
          );
      advance(actor, ref, busId);
      store.db
        .prepare(
          "INSERT INTO bus_operations(id,mode,actor_id,center_id,center_type,bus_id,action,state,created_at,completed_at) VALUES(?,?,?,?,?,?,?,'committed',?,?)",
        )
        .run(
          operation,
          actor.mode,
          actor.dealerId,
          ref.id,
          ref.type,
          busId,
          change.action,
          Date.now(),
          Date.now(),
        );
      return { ...previewDetail(actor, ref, busId), receiptRecorded: true };
    });
  }
  const tx = new sql.Transaction(await getPool('secure'));
  let committing = false,
    committed = false;
  await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    await updateBusInTransaction(actor, ref, busId, change, tx);
    intent();
    committing = true;
    await tx.commit();
    committed = true;
  } catch (error) {
    if (!committed) await tx.rollback().catch(() => undefined);
    if (committing)
      throw new PortalError(
        503,
        'COMMIT_UNCONFIRMED',
        'The save could not be confirmed. Reload the current settings before making another change.',
      );
    throw error;
  }
  let receiptRecorded = true;
  try {
    confirmed();
  } catch {
    receiptRecorded = false;
  }
  // The SQL commit is confirmed even if the fresh read is temporarily unavailable.
  try {
    return { ...(await getBus(actor, ref, busId)), receiptRecorded };
  } catch {
    throw new PortalError(
      503,
      'SAVED_RELOAD_REQUIRED',
      'The settings were saved. Reload to view the current result.',
    );
  }
}
