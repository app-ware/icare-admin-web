import 'server-only';
import sql from 'mssql';
import { randomUUID } from 'node:crypto';
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
  statusChangeSchema,
  statusQuerySchema,
  statusRefSchema,
  statusState,
  type CenterStatus,
  type StatusChange,
  type StatusDetail,
  type StatusDirectory,
  type StatusHistory,
  type StatusQuery,
} from '@/domain/status';
import { demoDealer } from '@/server/auth/dealers';
import { getPool } from '@/server/db/pools';
import { getStore, digest } from '@/server/store';
import { statusWritesEnabled } from '@/server/runtime';
import { PortalError } from '@/server/http';

type Row = Record<string, unknown>;
const readScope = `EXISTS(SELECT 1 FROM dbo.Dealers a WHERE a.dealer_id=@actor AND a.is_active=1 AND
 (a.is_super_admin=1 OR EXISTS(SELECT 1 FROM dbo.Dealer_Centers l WHERE l.dealer_id=a.dealer_id AND l.center_id=c.center_id AND l.center_type=c.type)
 OR EXISTS(SELECT 1 FROM dbo.Dealer_Page_Center_Access p WHERE p.dealer_id=a.dealer_id AND p.center_id=c.center_id AND p.center_type=c.type AND p.page_id=9)))`;
const writeScope = `EXISTS(SELECT 1 FROM dbo.Dealers a WHERE a.dealer_id=@actor AND a.is_active=1 AND
 (a.is_super_admin=1 OR EXISTS(SELECT 1 FROM dbo.Dealer_Centers l WHERE l.dealer_id=a.dealer_id AND l.center_id=c.center_id AND l.center_type=c.type)))`;
const centers = `SELECT c.center_id,CONVERT(int,c.type) AS type,c.center_name FROM icare.dbo.Care_Center c WHERE c.type IN(1,3)
 UNION ALL SELECT c.center_id,CONVERT(int,c.type),c.center_name FROM icare_school.dbo.Care_Center c WHERE c.type=4`;
const domain = `OUTER APPLY(SELECT TOP(1) center_domain FROM dbo.Center_Domains d WHERE d.center_id=c.center_id AND d.center_type=c.type ORDER BY ID DESC)d`;
const states = `OUTER APPLY(SELECT COUNT(*) AS status_count FROM dbo.Center_Status s WHERE s.center_id=c.center_id AND s.center_type=c.type)n
 OUTER APPLY(SELECT TOP(1) ID,activation_status,CONVERT(varchar(33),update_time,126) AS update_time FROM dbo.Center_Status s WHERE s.center_id=c.center_id AND s.center_type=c.type ORDER BY ID DESC)s`;

function actualPreview(actor: PortalActor) {
  const identity = demoDealer(actor.dealerId);
  if (!identity) throw new AccessDeniedError();
  return {
    ...actor,
    isSuperAdmin: identity.isSuperAdmin,
    grants: centerGrants(
      identity.isSuperAdmin,
      identity.ownedKeys,
      identity.reportKeys,
      identity.statusKeys,
    ),
  };
}
function availableWrites(actor: PortalActor) {
  return actor.mode === 'preview' || statusWritesEnabled();
}
function missing(): never {
  throw new PortalError(
    404,
    'CENTER_NOT_FOUND',
    'Center status is unavailable or outside your access.',
  );
}
function conflict(): never {
  throw new PortalError(
    409,
    'REVISION_CONFLICT',
    'This status changed. Reload the current status before saving.',
  );
}
function mapSql(row: Row, actor: PortalActor): CenterStatus {
  const ref = statusRefSchema.parse({ id: Number(row.center_id), type: Number(row.type) });
  const code = row.activation_status == null ? null : Number(row.activation_status);
  const state = statusState(code, Number(row.status_count));
  return {
    ...ref,
    name: String(row.center_name),
    domain: String(row.center_domain ?? ''),
    code,
    state,
    updatedAt: row.update_time == null ? null : `${row.update_time}Z`,
    revision: digest(
      JSON.stringify([
        ref,
        row.center_name,
        row.center_domain ?? null,
        Number(row.status_count),
        row.ID ?? null,
        code,
        row.update_time ?? null,
      ]),
    ),
    canManage:
      availableWrites(actor) &&
      Boolean(row.can_manage) &&
      hasPermission(actor, 'status.manage', ref) &&
      state !== 'review',
  };
}
function previewCenters(actor: PortalActor): CenterStatus[] {
  const store = getStore();
  // actualPreview seeds before entering a mutation transaction; do not nest seed transactions.
  const rows = store.db
    .prepare('SELECT id,type,profile,domain,active FROM preview_centers')
    .all()
    .map((r) => ({
      id: Number(r.id),
      type: Number(r.type) as 1 | 3 | 4,
      profile: JSON.parse(String(r.profile)) as { name: string },
      domain: String(r.domain),
      active: r.active === null ? null : Boolean(r.active),
    }));
  return rows
    .filter((c) => hasPermission(actor, 'status.read', c))
    .map((c) => {
      const version = store.db
        .prepare('SELECT version FROM preview_status_versions WHERE center_id=? AND center_type=?')
        .get(c.id, c.type);
      const code = c.active === null ? null : Number(c.active);
      return {
        id: c.id,
        type: c.type,
        name: c.profile.name,
        domain: c.domain,
        code,
        state: statusState(code, code === null ? 0 : 1),
        updatedAt: null,
        revision: digest(JSON.stringify([centerKey(c), code, Number(version?.version ?? 0)])),
        canManage: hasPermission(actor, 'status.manage', c),
      };
    });
}
function history(
  actor: PortalActor,
  ref: CenterRef,
): Pick<StatusDetail, 'history' | 'historyAvailable'> {
  try {
    const rows = getStore()
      .db.prepare(
        `SELECT id,actor_name,previous_code,next_code,reason,state,created_at FROM center_status_operations
      WHERE mode=? AND center_id=? AND center_type=? ORDER BY created_at DESC,rowid DESC LIMIT 20`,
      )
      .all(actor.mode, ref.id, ref.type);
    return {
      historyAvailable: true,
      history: rows.map((r) => ({
        id: String(r.id),
        actor: String(r.actor_name),
        previousCode: r.previous_code === null ? null : Number(r.previous_code),
        nextCode: Number(r.next_code),
        reason: String(r.reason),
        state: r.state as StatusHistory['state'],
        createdAt: Number(r.created_at),
      })),
    };
  } catch {
    return { historyAvailable: false, history: [] };
  }
}
async function sqlCenter(
  request: sql.Request,
  actor: PortalActor,
  ref: CenterRef,
  lock = false,
): Promise<CenterStatus> {
  // Lock the actor and ownership before a write, independently of session-derived claims.
  if (lock) {
    const allowed =
      await request.query(`SELECT is_super_admin FROM dbo.Dealers WITH(UPDLOCK,HOLDLOCK) WHERE dealer_id=@actor AND is_active=1;
      SELECT center_id FROM dbo.Dealer_Centers WITH(UPDLOCK,HOLDLOCK) WHERE dealer_id=@actor AND center_id=@id AND center_type=@type;
      SELECT ID FROM dbo.Center_Status WITH(UPDLOCK,HOLDLOCK) WHERE center_id=@id AND center_type=@type;`);
    const sets = allowed.recordsets as unknown as Row[][];
    if (!sets[0]?.[0] || (!sets[0][0].is_super_admin && !sets[1]?.length))
      throw new AccessDeniedError();
  }
  const result =
    await request.query(`WITH Centers AS(${centers}) SELECT c.*,d.center_domain,n.status_count,s.ID,s.activation_status,s.update_time,
    CASE WHEN ${writeScope} THEN 1 ELSE 0 END AS can_manage FROM Centers c ${domain} ${states}
    WHERE c.center_id=@id AND c.type=@type AND ${readScope};`);
  if (result.recordset.length !== 1) missing();
  return mapSql(result.recordset[0], actor);
}
function request(pool: sql.ConnectionPool | sql.Transaction, actor: PortalActor, ref: CenterRef) {
  const r = pool instanceof sql.Transaction ? new sql.Request(pool) : pool.request();
  return r
    .input('actor', sql.Int, actor.dealerId)
    .input('id', sql.Int, ref.id)
    .input('type', sql.Int, ref.type);
}
// Shared with the explicit development acceptance runner; never exposed as request-selected SQL.
export async function getStatusInTransaction(
  transaction: sql.Transaction,
  actor: PortalActor,
  input: CenterRef,
): Promise<CenterStatus> {
  const ref = statusRefSchema.parse(input);
  assertPermission(actor, 'status.read', ref);
  if (actor.mode !== 'legacy') throw new AccessDeniedError();
  return sqlCenter(request(transaction, actor, ref), actor, ref);
}
export async function listStatuses(
  actor: PortalActor,
  input: StatusQuery,
): Promise<StatusDirectory> {
  assertCapability(actor, 'status.read');
  const query = statusQuerySchema.parse(input),
    pageSize = 12;
  if (actor.mode === 'preview') {
    const actual = actualPreview(actor),
      store = getStore();
    assertCapability(actual, 'status.read');
    if (query.dealerId && !actual.isSuperAdmin) throw new AccessDeniedError();
    const rows = previewCenters(actual).filter(
      (c) =>
        (!query.q ||
          `${c.name} ${c.domain} ${c.id}`.toLowerCase().includes(query.q.toLowerCase())) &&
        (query.type === 'all' || c.type === Number(query.type)) &&
        (query.status === 'all' || c.state === query.status) &&
        (!query.dealerId ||
          store.db
            .prepare(
              'SELECT 1 FROM preview_dealer_centers WHERE dealer_id=? AND center_id=? AND center_type=?',
            )
            .get(query.dealerId, c.id, c.type)),
    );
    rows.sort(
      (a, b) =>
        (query.sort === 'type' ? a.type - b.type : 0) ||
        (query.sort === 'name-desc' ? -1 : 1) * a.name.localeCompare(b.name) ||
        a.id - b.id,
    );
    const dealers = actual.isSuperAdmin
      ? store.db
          .prepare('SELECT id,name FROM preview_dealers ORDER BY name,id')
          .all()
          .map((r) => ({ id: Number(r.id), name: String(r.name) }))
      : [];
    return {
      items: rows.slice((query.page - 1) * pageSize, query.page * pageSize),
      total: rows.length,
      page: query.page,
      pageSize,
      canFilterDealer: actual.isSuperAdmin,
      dealers,
      writesEnabled: true,
    };
  }
  const pool = await getPool('secure');
  const active = await pool
    .request()
    .input('actor', sql.Int, actor.dealerId)
    .query('SELECT is_super_admin FROM dbo.Dealers WHERE dealer_id=@actor AND is_active=1');
  if (!active.recordset[0]) throw new AccessDeniedError();
  const administrator = active.recordset[0].is_super_admin === true;
  if (query.dealerId && (!administrator || !actor.isSuperAdmin)) throw new AccessDeniedError();
  const source = `SELECT c.*,d.center_domain,n.status_count,s.ID,s.activation_status,s.update_time,CASE WHEN ${writeScope} THEN 1 ELSE 0 END AS can_manage,
    CASE WHEN n.status_count=0 THEN 'unknown' WHEN n.status_count<>1 OR s.activation_status IS NULL OR s.activation_status NOT IN(0,1) THEN 'review' WHEN s.activation_status=1 THEN 'active' ELSE 'inactive' END AS state
    FROM Centers c ${domain} ${states} WHERE ${readScope}`;
  const filter = `(center_name LIKE @q OR ISNULL(center_domain,'') LIKE @q OR CONVERT(varchar(12),center_id) LIKE @q) AND (@type IS NULL OR type=@type)
    AND (@status='all' OR state=@status) AND (@dealer IS NULL OR EXISTS(SELECT 1 FROM dbo.Dealer_Centers l WHERE l.dealer_id=@dealer AND l.center_id=StatusRows.center_id AND l.center_type=StatusRows.type))`;
  const sort =
    query.sort === 'type'
      ? 'type,center_name,center_id'
      : query.sort === 'name-desc'
        ? 'center_name DESC,center_id,type'
        : 'center_name,center_id,type';
  const result = await pool
    .request()
    .input('actor', sql.Int, actor.dealerId)
    .input('q', sql.NVarChar(400), `%${query.q.replace(/[\[%_]/g, (c) => `[${c}]`)}%`)
    .input('type', sql.Int, query.type === 'all' ? null : Number(query.type))
    .input('status', sql.NVarChar(10), query.status)
    .input('dealer', sql.Int, query.dealerId ?? null)
    .input('offset', sql.Int, (query.page - 1) * pageSize)
    .input('limit', sql.Int, pageSize).query(`
    WITH Centers AS(${centers}),StatusRows AS(${source}) SELECT COUNT(*) AS total FROM StatusRows WHERE ${filter};
    WITH Centers AS(${centers}),StatusRows AS(${source}) SELECT * FROM StatusRows WHERE ${filter} ORDER BY ${sort} OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;
    SELECT dealer_id,dealer_name FROM dbo.Dealers WHERE EXISTS(SELECT 1 FROM dbo.Dealers a WHERE a.dealer_id=@actor AND a.is_active=1 AND a.is_super_admin=1) ORDER BY dealer_name,dealer_id;`);
  const sets = result.recordsets as unknown as Row[][];
  return {
    items: sets[1].map((row) => mapSql(row, actor)),
    total: Number(sets[0][0].total),
    page: query.page,
    pageSize,
    canFilterDealer: administrator && actor.isSuperAdmin,
    dealers: sets[2].map((r) => ({
      id: Number(r.dealer_id),
      name: String(r.dealer_name || 'Dealer'),
    })),
    writesEnabled: statusWritesEnabled(),
  };
}
export async function getStatus(actor: PortalActor, input: CenterRef): Promise<StatusDetail> {
  const ref = statusRefSchema.parse(input);
  assertPermission(actor, 'status.read', ref);
  let center: CenterStatus;
  if (actor.mode === 'preview') {
    const actual = actualPreview(actor);
    assertPermission(actual, 'status.read', ref);
    center = previewCenters(actual).find((c) => centerKey(c) === centerKey(ref)) ?? missing();
  } else center = await sqlCenter(request(await getPool('secure'), actor, ref), actor, ref);
  return { center, ...history(actor, ref) };
}
function validateChange(current: CenterStatus, data: StatusChange) {
  if (current.revision !== data.revision) conflict();
  if (current.state === 'review')
    throw new PortalError(
      409,
      'STATUS_REVIEW_REQUIRED',
      'Stored status records need review before they can be changed.',
    );
  if (current.code === Number(data.active))
    throw new PortalError(
      409,
      'STATUS_UNCHANGED',
      'The center already has this status. Reload its current status.',
    );
}
function beginReceipt(actor: PortalActor, ref: CenterRef, code: number | null, data: StatusChange) {
  const id = randomUUID();
  getStore()
    .db.prepare('INSERT INTO center_status_operations VALUES (?,?,?,?,?,?,?,?,?,?,?,NULL)')
    .run(
      id,
      actor.mode,
      actor.dealerId,
      actor.name,
      ref.id,
      ref.type,
      code,
      Number(data.active),
      data.reason,
      'preparing',
      Date.now(),
    );
  return id;
}
function finishReceipt(id: string, state: string) {
  getStore()
    .db.prepare('UPDATE center_status_operations SET state=?,completed_at=? WHERE id=?')
    .run(state, Date.now(), id);
}
export async function updateStatusInTransaction(
  transaction: sql.Transaction,
  actor: PortalActor,
  input: CenterRef,
  inputData: StatusChange,
  beforeWrite: (current: CenterStatus) => void,
): Promise<CenterStatus> {
  const ref = statusRefSchema.parse(input),
    data = statusChangeSchema.parse(inputData);
  assertPermission(actor, 'status.manage', ref);
  if (actor.mode !== 'legacy') throw new AccessDeniedError();
  const current = await sqlCenter(request(transaction, actor, ref), actor, ref, true);
  validateChange(current, data);
  beforeWrite(current);
  // Fixed allowlisted upsert. No call to the old write-then-log procedure.
  const result = await request(transaction, actor, ref).input(
    'status',
    sql.Int,
    Number(data.active),
  ).query(`
    IF EXISTS(SELECT 1 FROM dbo.Center_Status WHERE center_id=@id AND center_type=@type)
      UPDATE dbo.Center_Status SET activation_status=@status,update_time=GETUTCDATE() OUTPUT inserted.ID WHERE center_id=@id AND center_type=@type;
    ELSE INSERT dbo.Center_Status(center_id,center_type,activation_status,update_time) OUTPUT inserted.ID VALUES(@id,@type,@status,GETUTCDATE());`);
  if (result.recordset.length !== 1)
    throw new PortalError(
      409,
      'STATUS_REVIEW_REQUIRED',
      'Stored status records need review before they can be changed.',
    );
  return sqlCenter(request(transaction, actor, ref), actor, ref);
}
export async function changeStatus(
  actor: PortalActor,
  input: CenterRef,
  inputData: StatusChange,
): Promise<StatusDetail & { historyRecorded: boolean }> {
  const ref = statusRefSchema.parse(input),
    data = statusChangeSchema.parse(inputData);
  assertPermission(actor, 'status.manage', ref);
  if (actor.mode === 'preview') {
    const actual = actualPreview(actor),
      store = getStore();
    assertPermission(actual, 'status.manage', ref);
    return store.transaction(() => {
      const current =
        previewCenters(actual).find((c) => centerKey(c) === centerKey(ref)) ?? missing();
      validateChange(current, data);
      const id = beginReceipt(actual, ref, current.code, data);
      const changed = store.db
        .prepare('UPDATE preview_centers SET active=? WHERE id=? AND type=?')
        .run(Number(data.active), ref.id, ref.type);
      if (changed.changes !== 1) missing();
      store.db
        .prepare(
          'INSERT INTO preview_status_versions VALUES (?,?,1) ON CONFLICT(center_id,center_type) DO UPDATE SET version=version+1',
        )
        .run(ref.id, ref.type);
      finishReceipt(id, 'committed');
      return {
        center: previewCenters(actual).find((c) => centerKey(c) === centerKey(ref))!,
        ...history(actual, ref),
        historyRecorded: true,
      };
    });
  }
  if (!statusWritesEnabled())
    throw new PortalError(
      503,
      'STATUS_WRITES_DISABLED',
      'Live status changes are disabled in this environment.',
    );
  const transaction = new sql.Transaction(await getPool('secure'));
  let receipt: string | undefined,
    commitAttempted = false,
    committed = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const center = await updateStatusInTransaction(transaction, actor, ref, data, (current) => {
      receipt = beginReceipt(actor, ref, current.code, data);
    });
    finishReceipt(receipt!, 'unconfirmed');
    commitAttempted = true;
    await transaction.commit();
    committed = true;
    let historyRecorded = true;
    try {
      finishReceipt(receipt!, 'committed');
    } catch {
      historyRecorded = false;
    }
    const recent = history(actor, ref);
    return { center, ...recent, historyRecorded: historyRecorded && recent.historyAvailable };
  } catch (error) {
    if (!committed) {
      let rolledBack = false;
      try {
        await transaction.rollback();
        rolledBack = true;
      } catch {}
      if (receipt)
        try {
          finishReceipt(receipt, !commitAttempted && rolledBack ? 'failed' : 'unconfirmed');
        } catch {}
    }
    if (commitAttempted)
      throw new PortalError(
        503,
        'STATUS_OUTCOME_UNCONFIRMED',
        'The status change could not be confirmed. Reload the center before making another change.',
      );
    throw error;
  }
}
