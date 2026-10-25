import 'server-only';
import sql from 'mssql';
import {
  assertCapability,
  assertPermission,
  hasPermission,
  centerGrants,
  AccessDeniedError,
  type PortalActor,
} from '@/domain/access';
import { centerKey, type CenterRef } from '@/domain/centers';
import {
  alertBatchSchema,
  alertQuerySchema,
  alertState,
  activationLabel,
  utcToday,
  type AlertBatchInput,
  type AlertBatchResult,
  type AlertCenter,
  type AlertDirectory,
  type AlertQuery,
  type AlertTargetState,
} from '@/domain/alerts';
import { statusRefSchema } from '@/domain/status';
import { demoDealer } from '@/server/auth/dealers';
import { previewDealerDetail } from '@/server/dealers/preview';
import { getPool } from '@/server/db/pools';
import { getStore, digest } from '@/server/store';
import { alertWritesEnabled } from '@/server/runtime';
import { PortalError } from '@/server/http';

type Row = Record<string, unknown>;
// Match JavaScript trim whitespace when filtering malformed legacy messages in SQL.
const nonBlankPattern = `%[^${'\u0009\u000a\u000b\u000c\u000d \u00a0\u1680\u2000\u2001\u2002\u2003\u2004\u2005\u2006\u2007\u2008\u2009\u200a\u2028\u2029\u202f\u205f\u3000\ufeff'}]%`;
const centers = `SELECT center_id,CONVERT(int,type) AS type,center_name FROM icare.dbo.Care_Center WHERE type IN(1,3)
 UNION ALL SELECT center_id,CONVERT(int,type),center_name FROM icare_school.dbo.Care_Center WHERE type=4`;
const alerts = `SELECT a.*,CONVERT(int,c.type) AS type FROM icare.dbo.Center_Alert_Message a JOIN icare.dbo.Care_Center c ON c.center_id=a.center_id WHERE c.type IN(1,3)
 UNION ALL SELECT a.*,CONVERT(int,c.type) FROM icare_school.dbo.Center_Alert_Message a JOIN icare_school.dbo.Care_Center c ON c.center_id=a.center_id WHERE c.type=4`;
const scope = `EXISTS(SELECT 1 FROM dbo.Dealers actor WHERE actor.dealer_id=@actor AND actor.is_active=1 AND
 (actor.is_super_admin=1 OR EXISTS(SELECT 1 FROM dbo.Dealer_Centers l WHERE l.dealer_id=actor.dealer_id AND l.center_id=c.center_id AND l.center_type=c.type)
 OR EXISTS(SELECT 1 FROM dbo.Dealer_Page_Center_Access p WHERE p.dealer_id=actor.dealer_id AND p.center_id=c.center_id AND p.center_type=c.type AND p.page_id=8)))`;
const projection = `SELECT c.*,d.center_domain,a.alert_message_id,a.message_text,CONVERT(varchar(10),a.alert_expiry_date,23) AS expiry_date,
 CONVERT(varchar(33),a.update_time,126) AS updated_at,n.alert_count,s.activation_status,sn.status_count,
 CASE WHEN EXISTS(SELECT 1 FROM dbo.Dealers u WHERE u.dealer_id=@actor AND u.is_active=1 AND (u.is_super_admin=1 OR EXISTS(SELECT 1 FROM dbo.Dealer_Centers l WHERE l.dealer_id=u.dealer_id AND l.center_id=c.center_id AND l.center_type=c.type))) THEN 1 ELSE 0 END AS can_write,
 CASE WHEN EXISTS(SELECT 1 FROM dbo.Dealers u WHERE u.dealer_id=@actor AND u.is_active=1 AND u.is_super_admin=1) THEN 1 ELSE 0 END AS is_admin,
 CONVERT(varchar(10),GETUTCDATE(),23) AS today,
 CASE WHEN n.alert_count=0 THEN 'none' WHEN n.alert_count<>1 OR a.message_text IS NULL OR a.message_text COLLATE Latin1_General_100_BIN2 NOT LIKE @nonBlankPattern THEN 'review' WHEN a.alert_expiry_date<CONVERT(date,GETUTCDATE()) THEN 'expired' ELSE 'current' END AS alert_state,
 CASE WHEN sn.status_count=0 THEN 'unknown' WHEN sn.status_count<>1 OR s.activation_status IS NULL OR s.activation_status NOT IN(0,1) THEN 'review' WHEN s.activation_status=1 THEN 'active' ELSE 'inactive' END AS activation
 FROM Centers c
 OUTER APPLY(SELECT TOP(1) center_domain FROM dbo.Center_Domains WHERE center_id=c.center_id AND center_type=c.type ORDER BY ID DESC)d
 OUTER APPLY(SELECT COUNT(*) AS alert_count FROM Alerts WHERE center_id=c.center_id AND type=c.type)n
 OUTER APPLY(SELECT TOP(1) * FROM Alerts WHERE center_id=c.center_id AND type=c.type ORDER BY alert_message_id DESC)a
 OUTER APPLY(SELECT COUNT(*) AS status_count FROM dbo.Center_Status WHERE center_id=c.center_id AND center_type=c.type)sn
 OUTER APPLY(SELECT TOP(1) activation_status FROM dbo.Center_Status WHERE center_id=c.center_id AND center_type=c.type ORDER BY ID DESC)s
 WHERE ${scope}`;

function request(
  parent: sql.ConnectionPool | sql.Transaction,
  actor: PortalActor,
  ref?: CenterRef,
) {
  // Installed mssql supports per-request overrides; its separate type package lacks that overload.
  const Request = sql.Request as unknown as new (
    parent: sql.ConnectionPool | sql.Transaction,
    overrides: { requestTimeout: number },
  ) => sql.Request;
  const r = new Request(parent, { requestTimeout: 5000 })
    .input('actor', sql.Int, actor.dealerId)
    .input('nonBlankPattern', sql.NVarChar(100), nonBlankPattern);
  if (ref) r.input('id', sql.Int, ref.id).input('type', sql.Int, ref.type);
  return r;
}
function previewActor(actor: PortalActor, seed = true): PortalActor {
  const store = getStore();
  if (seed) {
    if (!demoDealer(actor.dealerId)) throw new AccessDeniedError();
  }
  const d = previewDealerDetail(store, actor.dealerId);
  if (!d?.active) throw new AccessDeniedError();
  const keys = store.db
    .prepare('SELECT center_id,center_type FROM preview_alert_grants WHERE dealer_id=?')
    .all(actor.dealerId)
    .map((r) => `${r.center_id}_${r.center_type}`);
  return {
    ...actor,
    isSuperAdmin: d.isSuperAdmin,
    grants: centerGrants(d.isSuperAdmin, d.centers.map(centerKey), [], [], keys),
  };
}
function enabled(actor: PortalActor) {
  return actor.mode === 'preview' || alertWritesEnabled();
}
function map(row: Row, actor: PortalActor): AlertCenter {
  const ref = statusRefSchema.parse({ id: Number(row.center_id), type: Number(row.type) });
  const message =
    row.message_text === null || row.message_text === undefined ? null : String(row.message_text);
  const expiryDate = row.expiry_date == null ? null : String(row.expiry_date);
  const state = alertState(message, expiryDate, Number(row.alert_count), String(row.today));
  return {
    ...ref,
    name: String(row.center_name),
    domain: String(row.center_domain ?? ''),
    message,
    expiryDate,
    state,
    activation: activationLabel(
      row.activation_status == null ? null : Number(row.activation_status),
      Number(row.status_count),
    ),
    updatedAt: row.updated_at == null ? null : `${row.updated_at}Z`,
    revision: digest(
      JSON.stringify([
        ref,
        Number(row.alert_count),
        row.alert_message_id ?? null,
        message,
        expiryDate,
        row.updated_at ?? null,
        Number(
          getStore()
            .db.prepare(
              'SELECT version FROM live_alert_versions WHERE center_id=? AND center_type=?',
            )
            .get(ref.id, ref.type)?.version ?? 0,
        ),
      ]),
    ),
    canPublish:
      enabled(actor) &&
      state !== 'review' &&
      Boolean(row.can_write) &&
      hasPermission(actor, 'alerts.write', ref),
    canReset:
      enabled(actor) &&
      state !== 'review' &&
      state !== 'none' &&
      Boolean(row.is_admin) &&
      hasPermission(actor, 'alerts.reset', ref),
  };
}
function previewCenters(actor: PortalActor): AlertCenter[] {
  const store = getStore(),
    today = utcToday();
  return store.db
    .prepare('SELECT id,type,profile,domain,active FROM preview_centers')
    .all()
    .flatMap((r) => {
      const ref = { id: Number(r.id), type: Number(r.type) as 1 | 3 | 4 };
      if (!hasPermission(actor, 'alerts.read', ref)) return [];
      const a = store.db
        .prepare('SELECT * FROM preview_alerts WHERE center_id=? AND center_type=?')
        .get(ref.id, ref.type);
      const version = Number(
        store.db
          .prepare('SELECT version FROM preview_alert_versions WHERE center_id=? AND center_type=?')
          .get(ref.id, ref.type)?.version ?? 0,
      );
      const message = a ? String(a.message) : null,
        expiryDate = a ? String(a.expiry_date) : null;
      const state = alertState(message, expiryDate, a ? 1 : 0, today);
      return [
        {
          ...ref,
          name: JSON.parse(String(r.profile)).name,
          domain: String(r.domain),
          message,
          expiryDate,
          state,
          activation: activationLabel(
            r.active == null ? null : Number(r.active),
            r.active == null ? 0 : 1,
          ),
          updatedAt: a ? String(a.updated_at) : null,
          revision: digest(JSON.stringify([centerKey(ref), message, expiryDate, version])),
          canPublish: hasPermission(actor, 'alerts.write', ref),
          canReset: state !== 'none' && hasPermission(actor, 'alerts.reset', ref),
        },
      ];
    });
}
function unavailable(): never {
  throw new PortalError(
    404,
    'CENTER_NOT_FOUND',
    'The center is unavailable or outside your alert access.',
  );
}
async function sqlCenter(
  parent: sql.ConnectionPool | sql.Transaction,
  actor: PortalActor,
  ref: CenterRef,
): Promise<AlertCenter> {
  const res = await request(parent, actor, ref).query(
    `WITH Centers AS(${centers}),Alerts AS(${alerts}) ${projection} AND c.center_id=@id AND c.type=@type;`,
  );
  if (res.recordset.length !== 1) unavailable();
  return map(res.recordset[0], actor);
}
export async function getAlert(actor: PortalActor, input: CenterRef): Promise<AlertCenter> {
  const ref = statusRefSchema.parse(input);
  assertPermission(actor, 'alerts.read', ref);
  if (actor.mode === 'preview') {
    const actual = previewActor(actor);
    assertPermission(actual, 'alerts.read', ref);
    return previewCenters(actual).find((c) => centerKey(c) === centerKey(ref)) ?? unavailable();
  }
  return sqlCenter(await getPool('secure'), actor, ref);
}
export async function listAlerts(actor: PortalActor, input: AlertQuery): Promise<AlertDirectory> {
  assertCapability(actor, 'alerts.read');
  const q = alertQuerySchema.parse(input),
    pageSize = 12;
  if (actor.mode === 'preview') {
    const actual = previewActor(actor),
      store = getStore();
    if (q.dealerId && !actual.isSuperAdmin) throw new AccessDeniedError();
    const rows = previewCenters(actual)
      .filter(
        (c) =>
          (!q.q || `${c.name} ${c.domain} ${c.id}`.toLowerCase().includes(q.q.toLowerCase())) &&
          (q.type === 'all' || c.type === Number(q.type)) &&
          (q.state === 'all' || c.state === q.state) &&
          (q.activation === 'all' || c.activation === q.activation) &&
          (!q.dealerId ||
            store.db
              .prepare(
                'SELECT 1 FROM preview_dealer_centers WHERE dealer_id=? AND center_id=? AND center_type=?',
              )
              .get(q.dealerId, c.id, c.type)),
      )
      .sort((a, b) => a.name.localeCompare(b.name) || a.type - b.type || a.id - b.id);
    return {
      items: rows.slice((q.page - 1) * pageSize, q.page * pageSize),
      total: rows.length,
      page: q.page,
      pageSize,
      today: utcToday(),
      writesEnabled: true,
      canReset: actual.isSuperAdmin,
      canFilterDealer: actual.isSuperAdmin,
      dealers: actual.isSuperAdmin
        ? store.db
            .prepare('SELECT id,name FROM preview_dealers ORDER BY name,id')
            .all()
            .map((r) => ({ id: Number(r.id), name: String(r.name) }))
        : [],
    };
  }
  const pool = await getPool('secure');
  const active = await request(pool, actor).query(
    'SELECT is_super_admin FROM dbo.Dealers WHERE dealer_id=@actor AND is_active=1',
  );
  if (!active.recordset[0]) throw new AccessDeniedError();
  if (q.dealerId && (!actor.isSuperAdmin || active.recordset[0].is_super_admin !== true))
    throw new AccessDeniedError();
  const filter = `(center_name LIKE @q OR ISNULL(center_domain,'') LIKE @q OR CONVERT(varchar(12),center_id) LIKE @q) AND (@type IS NULL OR type=@type) AND (@state='all' OR alert_state=@state) AND (@activation='all' OR activation=@activation) AND (@dealer IS NULL OR EXISTS(SELECT 1 FROM dbo.Dealer_Centers l WHERE l.dealer_id=@dealer AND l.center_id=AlertRows.center_id AND l.center_type=AlertRows.type))`;
  const res = await request(pool, actor)
    .input('q', sql.NVarChar(400), `%${q.q.replace(/[\[%_]/g, (c) => `[${c}]`)}%`)
    .input('type', sql.Int, q.type === 'all' ? null : Number(q.type))
    .input('state', sql.NVarChar(10), q.state)
    .input('activation', sql.NVarChar(10), q.activation)
    .input('dealer', sql.Int, q.dealerId ?? null)
    .input('offset', sql.Int, (q.page - 1) * pageSize).query(`
    WITH Centers AS(${centers}),Alerts AS(${alerts}),AlertRows AS(${projection}) SELECT COUNT(*) AS total FROM AlertRows WHERE ${filter};
    WITH Centers AS(${centers}),Alerts AS(${alerts}),AlertRows AS(${projection}) SELECT * FROM AlertRows WHERE ${filter} ORDER BY center_name,center_id,type OFFSET @offset ROWS FETCH NEXT 12 ROWS ONLY;
    SELECT dealer_id,dealer_name FROM dbo.Dealers WHERE EXISTS(SELECT 1 FROM dbo.Dealers u WHERE u.dealer_id=@actor AND u.is_active=1 AND u.is_super_admin=1) ORDER BY dealer_name,dealer_id;
    SELECT CONVERT(varchar(10),GETUTCDATE(),23) AS today;`);
  const sets = res.recordsets as unknown as Row[][];
  return {
    items: sets[1].map((r) => map(r, actor)),
    total: Number(sets[0][0].total),
    page: q.page,
    pageSize,
    today: String(sets[3][0].today),
    writesEnabled: alertWritesEnabled(),
    canReset: actor.isSuperAdmin && active.recordset[0].is_super_admin === true,
    canFilterDealer: actor.isSuperAdmin && active.recordset[0].is_super_admin === true,
    dealers: sets[2].map((r) => ({
      id: Number(r.dealer_id),
      name: String(r.dealer_name || 'Dealer'),
    })),
  };
}
function validate(current: AlertCenter, input: AlertBatchInput, revision: string, today: string) {
  if (current.revision !== revision)
    throw new PortalError(
      409,
      'REVISION_CONFLICT',
      'This alert changed. Reload the center and review a new batch.',
    );
  if (current.state === 'review')
    throw new PortalError(
      409,
      'ALERT_REVIEW_REQUIRED',
      'Duplicate or invalid alert records require review before changes.',
    );
  if (input.action === 'publish') {
    if (input.expiryDate < today)
      throw new PortalError(422, 'EXPIRY_IN_PAST', 'Choose today or a future date in UTC.');
    if (current.message === input.message && current.expiryDate === input.expiryDate)
      throw new PortalError(409, 'ALERT_UNCHANGED', 'This message and expiry are already stored.');
  } else if (current.state === 'none')
    throw new PortalError(409, 'ALERT_ABSENT', 'There is no stored alert to reset.');
}
export async function updateAlertInTransaction(
  tx: sql.Transaction,
  actor: PortalActor,
  input: AlertBatchInput,
  target: AlertBatchInput['targets'][number],
  beforeWrite: () => void,
): Promise<void> {
  input = alertBatchSchema.parse(input);
  const ref = statusRefSchema.parse({ id: target.id, type: target.type });
  assertPermission(actor, input.action === 'publish' ? 'alerts.write' : 'alerts.reset', ref);
  if (actor.mode !== 'legacy') throw new AccessDeniedError();
  const table =
    ref.type === 4 ? 'icare_school.dbo.Center_Alert_Message' : 'icare.dbo.Center_Alert_Message';
  const locked = await request(tx, actor, ref)
    .query(`SELECT is_super_admin FROM dbo.Dealers WITH(UPDLOCK,HOLDLOCK) WHERE dealer_id=@actor AND is_active=1;
    SELECT center_id FROM dbo.Dealer_Centers WITH(UPDLOCK,HOLDLOCK) WHERE dealer_id=@actor AND center_id=@id AND center_type=@type;
    SELECT alert_message_id FROM ${table} WITH(UPDLOCK,HOLDLOCK) WHERE center_id=@id;`);
  const sets = locked.recordsets as unknown as Row[][];
  if (
    !sets[0]?.[0] ||
    (input.action === 'reset'
      ? !sets[0][0].is_super_admin
      : !sets[0][0].is_super_admin && !sets[1].length)
  )
    throw new AccessDeniedError();
  const current = await sqlCenter(tx, actor, ref);
  const clock = await request(tx, actor).query(
    'SELECT CONVERT(varchar(10),GETUTCDATE(),23) AS today',
  );
  validate(current, input, target.revision, clock.recordset[0].today);
  beforeWrite();
  let result: sql.IResult<Row>;
  if (input.action === 'reset')
    result = await request(tx, actor, ref).query(
      `DELETE ${table} OUTPUT deleted.alert_message_id WHERE center_id=@id`,
    );
  else
    result = await request(tx, actor, ref)
      .input('message', sql.NVarChar(250), input.message)
      .input('expiry', sql.VarChar(10), input.expiryDate).query(`
    IF EXISTS(SELECT 1 FROM ${table} WHERE center_id=@id) UPDATE ${table} SET message_text=@message,alert_expiry_date=CONVERT(date,@expiry,23),dealer_id=@actor,update_time=GETUTCDATE() OUTPUT inserted.alert_message_id WHERE center_id=@id;
    ELSE INSERT ${table}(center_id,dealer_id,message_text,alert_expiry_date,update_time) OUTPUT inserted.alert_message_id VALUES(@id,@actor,@message,CONVERT(date,@expiry,23),GETUTCDATE());`);
  if (result.recordset.length !== 1)
    throw new PortalError(
      409,
      'ALERT_REVIEW_REQUIRED',
      'The stored alert could not be changed safely.',
    );
}
function resultRow(
  batchId: string,
  ref: CenterRef,
  state: AlertTargetState,
  code: string | null = null,
  message: string | null = null,
  retryable = false,
) {
  getStore()
    .db.prepare(
      'UPDATE alert_batch_targets SET state=?,code=?,message=?,retryable=? WHERE batch_id=? AND center_id=? AND center_type=?',
    )
    .run(state, code, message, Number(retryable), batchId, ref.id, ref.type);
}
function safeFailure(error: unknown) {
  if (error instanceof AccessDeniedError)
    return {
      code: 'ACCESS_DENIED',
      message: 'You no longer have permission to change this center.',
      retryable: false,
    };
  if (error instanceof PortalError)
    return { code: error.code, message: error.message, retryable: false };
  return {
    code: 'SERVICE_UNAVAILABLE',
    message: 'The change was not saved. You can retry this failed target.',
    retryable: true,
  };
}
async function processTarget(
  actor: PortalActor,
  input: AlertBatchInput,
  target: AlertBatchInput['targets'][number],
) {
  const ref = { id: target.id, type: target.type },
    store = getStore();
  if (actor.mode === 'preview') {
    try {
      store.transaction(() => {
        const actual = previewActor(actor, false);
        assertPermission(actual, input.action === 'publish' ? 'alerts.write' : 'alerts.reset', ref);
        const current =
          previewCenters(actual).find((c) => centerKey(c) === centerKey(ref)) ?? unavailable();
        validate(current, input, target.revision, utcToday());
        if (input.action === 'reset')
          store.db
            .prepare('DELETE FROM preview_alerts WHERE center_id=? AND center_type=?')
            .run(ref.id, ref.type);
        else
          store.db
            .prepare(
              'INSERT INTO preview_alerts VALUES (?,?,?,?,?) ON CONFLICT(center_id,center_type) DO UPDATE SET message=excluded.message,expiry_date=excluded.expiry_date,updated_at=excluded.updated_at',
            )
            .run(ref.id, ref.type, input.message, input.expiryDate, new Date().toISOString());
        store.db
          .prepare(
            'INSERT INTO preview_alert_versions VALUES (?,?,1) ON CONFLICT(center_id,center_type) DO UPDATE SET version=version+1',
          )
          .run(ref.id, ref.type);
        resultRow(input.id, ref, 'succeeded');
      });
    } catch (error) {
      const failure = safeFailure(error);
      resultRow(input.id, ref, 'failed', failure.code, failure.message, failure.retryable);
    }
    return;
  }
  let tx: sql.Transaction | undefined,
    commitAttempted = false;
  try {
    assertPermission(actor, input.action === 'publish' ? 'alerts.write' : 'alerts.reset', ref);
    if (!alertWritesEnabled())
      throw new PortalError(503, 'ALERT_WRITES_DISABLED', 'Live alert changes are disabled.');
    tx = new sql.Transaction(await getPool('secure'));
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    await updateAlertInTransaction(tx, actor, input, target, () => {
      resultRow(input.id, ref, 'working');
    });
    store.transaction(() => {
      // Durable generation survives deletion/reset and uncertain commit acknowledgements.
      store.db
        .prepare(
          'INSERT INTO live_alert_versions VALUES (?,?,1) ON CONFLICT(center_id,center_type) DO UPDATE SET version=version+1',
        )
        .run(ref.id, ref.type);
      resultRow(
        input.id,
        ref,
        'unconfirmed',
        'OUTCOME_UNCONFIRMED',
        'Reload the center before deciding whether another change is needed.',
      );
    });
    commitAttempted = true;
    await tx.commit();
    // SQL is confirmed. If this local update fails, retain the durable unconfirmed receipt.
    try {
      resultRow(input.id, ref, 'succeeded');
    } catch {}
  } catch (error) {
    if (tx) await tx.rollback().catch(() => {});
    if (commitAttempted) {
      try {
        resultRow(
          input.id,
          ref,
          'unconfirmed',
          'OUTCOME_UNCONFIRMED',
          'The outcome is uncertain. Reload the center before making another change.',
        );
      } catch {}
    } else {
      const failure = safeFailure(error);
      resultRow(input.id, ref, 'failed', failure.code, failure.message, failure.retryable);
    }
  }
}
function ownedBatch(actor: PortalActor, id: string) {
  assertCapability(actor, 'alerts.read');
  const row = getStore()
    .db.prepare('SELECT * FROM alert_batches WHERE id=? AND actor_id=? AND mode=?')
    .get(id, actor.dealerId, actor.mode);
  if (!row) throw new PortalError(404, 'BATCH_NOT_FOUND', 'This alert batch is unavailable.');
  if (Number(row.expires_at) <= Date.now())
    throw new PortalError(
      410,
      'BATCH_EXPIRED',
      'This batch has expired. Reload the centers and review a new batch.',
    );
  return row;
}
export async function getAlertBatch(actor: PortalActor, id: string): Promise<AlertBatchResult> {
  const row = ownedBatch(actor, id),
    store = getStore(),
    input = alertBatchSchema.parse(JSON.parse(String(row.payload)));
  if (Number(row.lease_until) > 0 && Number(row.lease_until) <= Date.now())
    store.transaction(() => {
      store.db
        .prepare(
          "UPDATE alert_batch_targets SET state='unconfirmed',code='OUTCOME_UNCONFIRMED',message='An interrupted attempt needs review. Reload the center before another change.',retryable=0 WHERE batch_id=? AND state='working'",
        )
        .run(id);
      store.db.prepare('UPDATE alert_batches SET lease_until=0 WHERE id=?').run(id);
    });
  const targets: AlertBatchResult['targets'] = [];
  let anyScope = false;
  for (const r of store.db
    .prepare('SELECT * FROM alert_batch_targets WHERE batch_id=? ORDER BY center_type,center_id')
    .all(id)) {
    const ref = { id: Number(r.center_id), type: Number(r.center_type) as 1 | 3 | 4 };
    let accessible = false;
    try {
      await getAlert(actor, ref);
      accessible = true;
      anyScope = true;
    } catch {}
    targets.push({
      ...ref,
      state: r.state as AlertTargetState,
      code: accessible ? (r.code == null ? null : String(r.code)) : 'ACCESS_UNAVAILABLE',
      message: accessible
        ? r.message == null
          ? null
          : String(r.message)
        : 'Center access or current data is unavailable. Reload before another change.',
      retryable: accessible && Boolean(r.retryable),
      attempts: Number(r.attempts),
    });
  }
  return {
    id,
    action: input.action,
    ...(anyScope && input.action === 'publish'
      ? { message: input.message, expiryDate: input.expiryDate }
      : {}),
    running: Number(ownedBatch(actor, id).lease_until) > Date.now(),
    expiresAt: Number(row.expires_at),
    targets,
  };
}
export async function submitAlertBatch(
  actor: PortalActor,
  raw: AlertBatchInput,
  retry = false,
): Promise<AlertBatchResult> {
  const input = alertBatchSchema.parse(raw);
  assertCapability(actor, input.action === 'publish' ? 'alerts.write' : 'alerts.reset');
  if (actor.mode === 'preview') previewActor(actor);
  if (!enabled(actor))
    throw new PortalError(
      503,
      'ALERT_WRITES_DISABLED',
      'Live alert changes are disabled in this environment.',
    );
  if (input.action === 'publish' && input.expiryDate < utcToday())
    throw new PortalError(422, 'EXPIRY_IN_PAST', 'Choose today or a future date in UTC.');
  const store = getStore(),
    fingerprint = digest(JSON.stringify(input));
  if (
    !store.db.prepare('SELECT 1 FROM alert_batches WHERE id=?').get(input.id) &&
    !store.consumeLimit(`alerts:batch:${actor.mode}:${actor.dealerId}`, 20, 60_000)
  )
    throw new PortalError(
      429,
      'ALERT_RATE_LIMIT',
      'Too many alert batches. Wait a minute before creating another batch.',
    );
  const work = store.transaction(() => {
    let row = store.db.prepare('SELECT * FROM alert_batches WHERE id=?').get(input.id);
    if (row) {
      if (
        row.actor_id !== actor.dealerId ||
        row.mode !== actor.mode ||
        row.fingerprint !== fingerprint
      )
        throw new PortalError(
          409,
          'BATCH_ID_CONFLICT',
          'Use a new batch ID for a different reviewed change.',
        );
      ownedBatch(actor, input.id);
      if (Number(row.lease_until) > Date.now())
        throw new PortalError(
          409,
          'BATCH_RUNNING',
          'This batch is still running. Check its results.',
        );
      if (Number(row.lease_until) > 0)
        store.db
          .prepare(
            "UPDATE alert_batch_targets SET state='unconfirmed',code='OUTCOME_UNCONFIRMED',message='An interrupted attempt needs review.',retryable=0 WHERE batch_id=? AND state='working'",
          )
          .run(input.id);
      if (!retry) return [];
    } else {
      store.db
        .prepare('INSERT INTO alert_batches VALUES (?,?,?,?,?,?,?,0)')
        .run(
          input.id,
          actor.dealerId,
          actor.mode,
          fingerprint,
          JSON.stringify(input),
          Date.now(),
          Date.now() + 24 * 60 * 60_000,
        );
      for (const target of input.targets)
        store.db
          .prepare("INSERT INTO alert_batch_targets VALUES (?,?,?,?,'pending',NULL,NULL,0,0)")
          .run(input.id, target.id, target.type, target.revision);
    }
    const targets = store.db
      .prepare(
        "SELECT * FROM alert_batch_targets WHERE batch_id=? AND (state='pending' OR (state='failed' AND retryable=1 AND attempts<3))",
      )
      .all(input.id);
    if (targets.length)
      store.db
        .prepare('UPDATE alert_batches SET lease_until=? WHERE id=?')
        .run(Date.now() + 5 * 60_000, input.id);
    return targets;
  });
  const start = Date.now();
  try {
    for (const row of work) {
      const target = {
        id: Number(row.center_id),
        type: Number(row.center_type) as 1 | 3 | 4,
        revision: String(row.revision),
      };
      if (Date.now() - start > 45_000) {
        resultRow(
          input.id,
          target,
          'failed',
          'BATCH_TIME_LIMIT',
          'This target was not attempted. Retry the failed target.',
          true,
        );
        continue;
      }
      store.db
        .prepare(
          "UPDATE alert_batch_targets SET state='working',attempts=attempts+1 WHERE batch_id=? AND center_id=? AND center_type=?",
        )
        .run(input.id, target.id, target.type);
      await processTarget(actor, input, target);
    }
  } finally {
    if (work.length)
      store.transaction(() => {
        store.db
          .prepare(
            "UPDATE alert_batch_targets SET state='unconfirmed',code='OUTCOME_UNCONFIRMED',message='An interrupted attempt needs review. Reload the center before another change.',retryable=0 WHERE batch_id=? AND state='working'",
          )
          .run(input.id);
        store.db.prepare('UPDATE alert_batches SET lease_until=0 WHERE id=?').run(input.id);
      });
  }
  return getAlertBatch(actor, input.id);
}
export async function retryAlertBatch(actor: PortalActor, id: string) {
  const row = ownedBatch(actor, id);
  return submitAlertBatch(actor, alertBatchSchema.parse(JSON.parse(String(row.payload))), true);
}
