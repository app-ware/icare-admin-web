import 'server-only';
import sql from 'mssql';
import { randomUUID } from 'node:crypto';
import { assertPermission, AccessDeniedError, type PortalActor } from '@/domain/access';
import { centerKey, centerRefSchema, type CenterRef } from '@/domain/centers';
import {
  assertDealerLifecycle,
  DealerPolicyError,
  type DealerCreate,
  type DealerUpdate,
  type DealerQuery,
  type DealerSummary,
  type DealerDetail,
  type DealerDirectory,
  type CenterOption,
} from '@/domain/dealers';
import { getPool } from '@/server/db/pools';
import { getStore, digest, type PortalStore } from '@/server/store';
import { dealerWritesEnabled } from '@/server/runtime';
import { PortalError } from '@/server/http';
import { seedDealerPreview, previewDealerDetail } from './preview';

const actorScope = `EXISTS(SELECT 1 FROM dbo.Dealers current_actor
 WHERE current_actor.dealer_id=@actor AND current_actor.is_active=1 AND current_actor.is_super_admin=1)`;
const accountColumns = `d.dealer_id,d.dealer_name,d.username,d.user_email,d.is_active,d.is_super_admin,
 CONVERT(varchar(10),d.creation_date,23) AS created_date`;
const centerCatalog = `SELECT center_id,CONVERT(int,type) AS type,center_name FROM icare.dbo.Care_Center WHERE type IN(1,3)
 UNION ALL SELECT center_id,CONVERT(int,type) AS type,center_name FROM icare_school.dbo.Care_Center WHERE type=4`;
type Row = Record<string, unknown>;
export function assertDealerAdministrator(actor: PortalActor) {
  assertPermission(actor, 'dealers.manage');
  if (!actor.isSuperAdmin) throw new AccessDeniedError();
}
function previewStore(actor: PortalActor) {
  assertDealerAdministrator(actor);
  const store = getStore();
  seedDealerPreview(store);
  const current = previewDealerDetail(store, actor.dealerId);
  if (!current?.active || !current.isSuperAdmin) throw new AccessDeniedError();
  return store;
}
function summary(row: Row): DealerSummary {
  return {
    id: Number(row.dealer_id),
    name: String(row.dealer_name ?? ''),
    username: String(row.username ?? ''),
    email: String(row.user_email ?? ''),
    active: row.is_active === true,
    isSuperAdmin: row.is_super_admin === true,
    centerCount: Number(row.center_count ?? 0),
    createdDate: String(row.created_date ?? ''),
  };
}
function detail(row: Row, links: Row[]): DealerDetail {
  const base = summary(row);
  const unique = [
    ...new Map(links.map((l) => [`${l.center_id}_${l.center_type}`, l])).values(),
  ].sort(
    (a, b) =>
      Number(a.center_type) - Number(b.center_type) || Number(a.center_id) - Number(b.center_id),
  );
  const centers = unique.flatMap((link) => {
    const parsed = centerRefSchema.safeParse({
      id: Number(link.center_id),
      type: Number(link.center_type),
    });
    return parsed.success
      ? [
          {
            ...parsed.data,
            name: String(link.center_name ?? `Unavailable center #${link.center_id}`),
            available: link.center_name != null,
          },
        ]
      : [];
  });
  base.centerCount = centers.length;
  return {
    ...base,
    centers,
    unsupportedAssignments: unique.length - centers.length,
    revision: digest(JSON.stringify([base, unique.map((l) => `${l.center_id}_${l.center_type}`)])),
  };
}
function authorizeRecordsets(sets: Row[][]) {
  if (!sets[0]?.[0]?.allowed) throw new AccessDeniedError();
}
function notFound(): never {
  throw new PortalError(404, 'DEALER_NOT_FOUND', 'Dealer not found.');
}
function conflict(): never {
  throw new PortalError(409, 'REVISION_CONFLICT', 'This account changed. Reload it before saving.');
}
function lifecycle(
  actor: PortalActor,
  target: DealerDetail,
  data: DealerUpdate,
  administrators: number,
) {
  try {
    assertDealerLifecycle(actor.dealerId, target, data, administrators);
  } catch (error) {
    if (!(error instanceof DealerPolicyError)) throw error;
    throw new PortalError(
      409,
      error.code,
      error.code === 'SELF_LOCKOUT'
        ? 'You cannot disable your own account or remove your administrator role.'
        : 'Keep at least one active administrator.',
    );
  }
}
const like = (q: string) => `%${q.replace(/[\[%_]/g, (c) => `[${c}]`)}%`;

export async function listDealers(
  actor: PortalActor,
  query: DealerQuery,
): Promise<DealerDirectory> {
  assertDealerAdministrator(actor);
  const pageSize = 12;
  if (actor.mode === 'preview') {
    const store = previewStore(actor);
    const all = store.db
      .prepare('SELECT id FROM preview_dealers')
      .all()
      .map((r) => previewDealerDetail(store, Number(r.id))!);
    const rows = all
      .filter(
        (d) =>
          (!query.q ||
            `${d.name} ${d.username} ${d.email}`.toLowerCase().includes(query.q.toLowerCase())) &&
          (query.status === 'all' || d.active === (query.status === 'active')) &&
          (query.role === 'all' || d.isSuperAdmin === (query.role === 'admin')),
      )
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    return {
      items: rows
        .slice((query.page - 1) * pageSize, query.page * pageSize)
        .map(({ revision, centers, unsupportedAssignments, ...d }) => d),
      total: rows.length,
      page: query.page,
      pageSize,
      activeCount: rows.filter((d) => d.active).length,
      adminCount: rows.filter((d) => d.active && d.isSuperAdmin).length,
    };
  }
  const filter = `${actorScope} AND (d.dealer_name LIKE @q OR d.username LIKE @q OR d.user_email LIKE @q)
    AND (@status='all' OR (@status='active' AND d.is_active=1) OR (@status='inactive' AND ISNULL(d.is_active,0)=0))
    AND (@role='all' OR (@role='admin' AND d.is_super_admin=1) OR (@role='dealer' AND ISNULL(d.is_super_admin,0)=0))`;
  const result = await (
    await getPool('secure')
  )
    .request()
    .input('actor', sql.Int, actor.dealerId)
    .input('q', sql.NVarChar(400), like(query.q))
    .input('status', sql.NVarChar(10), query.status)
    .input('role', sql.NVarChar(10), query.role)
    .input('offset', sql.Int, (query.page - 1) * pageSize)
    .input('limit', sql.Int, pageSize)
    .query(`SELECT CASE WHEN ${actorScope} THEN 1 ELSE 0 END AS allowed;
      SELECT COUNT(*) AS total,SUM(CASE WHEN d.is_active=1 THEN 1 ELSE 0 END) AS active_count,
        SUM(CASE WHEN d.is_active=1 AND d.is_super_admin=1 THEN 1 ELSE 0 END) AS admin_count FROM dbo.Dealers d WHERE ${filter};
      SELECT ${accountColumns},(SELECT COUNT(*) FROM (SELECT DISTINCT center_id,center_type FROM dbo.Dealer_Centers l WHERE l.dealer_id=d.dealer_id) links) AS center_count
      FROM dbo.Dealers d WHERE ${filter} ORDER BY d.dealer_name,d.dealer_id OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`);
  const sets = result.recordsets as unknown as Row[][];
  authorizeRecordsets(sets);
  const counts = sets[1][0];
  return {
    items: sets[2].map(summary),
    total: Number(counts.total),
    activeCount: Number(counts.active_count ?? 0),
    adminCount: Number(counts.admin_count ?? 0),
    page: query.page,
    pageSize,
  };
}
async function sqlDetail(request: sql.Request, id: number, lock = false): Promise<DealerDetail> {
  const result = await request.input('target', sql.Int, id).query(`
    SELECT CASE WHEN ${actorScope} THEN 1 ELSE 0 END AS allowed;
    SELECT ${accountColumns} FROM dbo.Dealers d ${lock ? 'WITH(UPDLOCK,HOLDLOCK)' : ''} WHERE d.dealer_id=@target AND ${actorScope};
    WITH Centers AS(${centerCatalog}) SELECT l.center_id,l.center_type,c.center_name FROM dbo.Dealer_Centers l
      ${lock ? 'WITH(UPDLOCK,HOLDLOCK)' : ''} LEFT JOIN Centers c ON c.center_id=l.center_id AND c.type=l.center_type
      WHERE l.dealer_id=@target AND ${actorScope};`);
  const sets = result.recordsets as unknown as Row[][];
  authorizeRecordsets(sets);
  if (!sets[1][0]) notFound();
  return detail(sets[1][0], sets[2]);
}
export async function getDealer(actor: PortalActor, id: number): Promise<DealerDetail> {
  assertDealerAdministrator(actor);
  if (actor.mode === 'preview') return previewDealerDetail(previewStore(actor), id) ?? notFound();
  return sqlDetail((await getPool('secure')).request().input('actor', sql.Int, actor.dealerId), id);
}
export async function dealerCenterOptions(actor: PortalActor, query: { q: string; page: number }) {
  assertDealerAdministrator(actor);
  const pageSize = 50;
  if (actor.mode === 'preview') {
    const store = previewStore(actor);
    const rows = store
      .previewCenters()
      .filter(
        (c) =>
          !query.q || `${c.profile.name} ${c.id}`.toLowerCase().includes(query.q.toLowerCase()),
      )
      .map((c) => ({ id: c.id, type: c.type, name: c.profile.name, available: true }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    return {
      items: rows.slice((query.page - 1) * pageSize, query.page * pageSize),
      total: rows.length,
      page: query.page,
      pageSize,
    };
  }
  const result = await (
    await getPool('secure')
  )
    .request()
    .input('actor', sql.Int, actor.dealerId)
    .input('q', sql.NVarChar(400), like(query.q))
    .input('offset', sql.Int, (query.page - 1) * pageSize)
    .input('limit', sql.Int, pageSize)
    .query(`SELECT CASE WHEN ${actorScope} THEN 1 ELSE 0 END AS allowed;
      WITH Centers AS(${centerCatalog}) SELECT COUNT(*) AS total FROM Centers WHERE ${actorScope} AND (center_name LIKE @q OR CONVERT(varchar(12),center_id) LIKE @q);
      WITH Centers AS(${centerCatalog}) SELECT center_id,type,center_name FROM Centers WHERE ${actorScope} AND (center_name LIKE @q OR CONVERT(varchar(12),center_id) LIKE @q)
      ORDER BY center_name,center_id,type OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`);
  const sets = result.recordsets as unknown as Row[][];
  authorizeRecordsets(sets);
  const items: CenterOption[] = sets[2].map((r) => ({
    id: Number(r.center_id),
    type: Number(r.type) as 1 | 3 | 4,
    name: String(r.center_name),
    available: true,
  }));
  return { items, total: Number(sets[1][0].total), page: query.page, pageSize };
}

function startOperation(
  store: PortalStore,
  actor: PortalActor,
  target: number | null,
  action: string,
) {
  const id = randomUUID();
  store.db
    .prepare('INSERT INTO dealer_operations VALUES (?,?,?,?,?,?,?,NULL)')
    .run(id, actor.mode, actor.dealerId, target, action, 'pending', Date.now());
  return id;
}
function finishOperation(store: PortalStore, id: string, state: string, target: number | null) {
  try {
    store.db
      .prepare('UPDATE dealer_operations SET state=?,target_id=?,completed_at=? WHERE id=?')
      .run(state, target, Date.now(), id);
  } catch {
    console.error('Dealer operation needs reconciliation', { operationId: id });
  }
}
async function lockAdministrator(transaction: sql.Transaction, actor: PortalActor) {
  const result = await new sql.Request(transaction)
    .query(`SELECT dealer_id FROM dbo.Dealers WITH(UPDLOCK,HOLDLOCK)
    WHERE is_super_admin=1 AND is_active=1 ORDER BY dealer_id;`);
  if (!result.recordset.some((r) => Number(r.dealer_id) === actor.dealerId))
    throw new AccessDeniedError();
  return result.recordset.length;
}
async function validateCenters(transaction: sql.Transaction, centers: CenterRef[]) {
  // JSON is a parameter parsed into a fixed table shape, never executable SQL.
  const result = await new sql.Request(transaction).input(
    'centers',
    sql.NVarChar(sql.MAX),
    JSON.stringify(centers),
  ).query(`WITH Centers AS(${centerCatalog}) SELECT COUNT(*) AS invalid_count
      FROM OPENJSON(@centers) WITH(id int '$.id',type int '$.type') requested
      WHERE NOT EXISTS(SELECT 1 FROM Centers c WHERE c.center_id=requested.id AND c.type=requested.type);`);
  if (Number(result.recordset[0].invalid_count))
    throw new PortalError(
      422,
      'CENTER_UNAVAILABLE',
      'An assigned center is unavailable. Review the center selection.',
    );
}
async function saveSqlLinks(transaction: sql.Transaction, id: number, centers: CenterRef[]) {
  await new sql.Request(transaction)
    .input('target', sql.Int, id)
    .input('centers', sql.NVarChar(sql.MAX), JSON.stringify(centers))
    .query(`DELETE FROM dbo.Dealer_Centers WHERE dealer_id=@target;
      INSERT dbo.Dealer_Centers(dealer_id,center_id,center_type)
      SELECT @target,id,type FROM OPENJSON(@centers) WITH(id int '$.id',type int '$.type');`);
}
function validatePreviewCenters(store: PortalStore, centers: CenterRef[]) {
  for (const c of centers)
    if (!store.db.prepare('SELECT 1 FROM preview_centers WHERE id=? AND type=?').get(c.id, c.type))
      throw new PortalError(
        422,
        'CENTER_UNAVAILABLE',
        'An assigned center is unavailable. Review the center selection.',
      );
}
function savePreviewLinks(store: PortalStore, id: number, centers: CenterRef[]) {
  store.db.prepare('DELETE FROM preview_dealer_centers WHERE dealer_id=?').run(id);
  for (const c of centers)
    store.db.prepare('INSERT INTO preview_dealer_centers VALUES (?,?,?)').run(id, c.id, c.type);
}
function changedAccess(current: DealerDetail, data: DealerUpdate) {
  return (
    current.active !== data.active ||
    current.isSuperAdmin !== data.isSuperAdmin ||
    JSON.stringify(current.centers.map(centerKey).sort()) !==
      JSON.stringify(data.centers.map(centerKey).sort())
  );
}
// Transaction-only commands are shared by the runtime and rollback integration
// checks. They never commit, read a password back, or create application sessions.
export async function createDealerInTransaction(
  transaction: sql.Transaction,
  actor: PortalActor,
  data: DealerCreate,
) {
  assertDealerAdministrator(actor);
  if (actor.mode !== 'legacy') throw new AccessDeniedError();
  await lockAdministrator(transaction, actor);
  await validateCenters(transaction, data.centers);
  const request = new sql.Request(transaction).input('username', sql.NVarChar(450), data.username);
  const duplicate = await request.query(
    'SELECT 1 AS found FROM dbo.Dealers WITH(UPDLOCK,HOLDLOCK) WHERE username=@username',
  );
  if (duplicate.recordset.length)
    throw new PortalError(409, 'USERNAME_EXISTS', 'This username is already in use.');
  const result = await request
    .input('name', sql.NVarChar(450), data.name)
    .input('email', sql.NVarChar(200), data.email || null)
    .input('password', sql.NVarChar(450), data.password)
    .input('active', sql.Bit, data.active)
    .input('admin', sql.Bit, data.isSuperAdmin).query(`DECLARE @salt uniqueidentifier=NEWID();
      INSERT dbo.Dealers(dealer_name,username,user_email,user_password,password_salt,is_active,is_super_admin)
      VALUES(@name,@username,@email,dbo.getHashedPassword(@password,@salt),@salt,@active,@admin);
      SELECT CONVERT(int,SCOPE_IDENTITY()) AS dealer_id;`);
  const id = Number(result.recordset[0].dealer_id);
  await saveSqlLinks(transaction, id, data.centers);
  return sqlDetail(new sql.Request(transaction).input('actor', sql.Int, actor.dealerId), id);
}
export async function updateDealerInTransaction(
  transaction: sql.Transaction,
  actor: PortalActor,
  id: number,
  data: DealerUpdate,
  onAccessChange: () => void,
) {
  assertDealerAdministrator(actor);
  if (actor.mode !== 'legacy') throw new AccessDeniedError();
  const administrators = await lockAdministrator(transaction, actor);
  const current = await sqlDetail(
    new sql.Request(transaction).input('actor', sql.Int, actor.dealerId),
    id,
    true,
  );
  if (current.revision !== data.revision) conflict();
  if (current.unsupportedAssignments)
    throw new PortalError(
      409,
      'UNSUPPORTED_ASSIGNMENTS',
      'This account has legacy center mappings that need review before editing.',
    );
  lifecycle(actor, current, data, administrators);
  await validateCenters(transaction, data.centers);
  if (id !== actor.dealerId && changedAccess(current, data)) onAccessChange();
  const result = await new sql.Request(transaction)
    .input('target', sql.Int, id)
    .input('actor', sql.Int, actor.dealerId)
    .input('name', sql.NVarChar(450), data.name)
    .input('email', sql.NVarChar(200), data.email || null)
    .input('active', sql.Bit, data.active)
    .input('admin', sql.Bit, data.isSuperAdmin)
    .query(`UPDATE dbo.Dealers SET dealer_name=@name,user_email=@email,is_active=@active,is_super_admin=@admin
      WHERE dealer_id=@target AND ${actorScope}; SELECT @@ROWCOUNT AS changed_count;`);
  if (Number(result.recordset[0].changed_count) !== 1) conflict();
  await saveSqlLinks(transaction, id, data.centers);
  return sqlDetail(new sql.Request(transaction).input('actor', sql.Int, actor.dealerId), id);
}
export async function createDealer(actor: PortalActor, data: DealerCreate): Promise<DealerDetail> {
  assertDealerAdministrator(actor);
  if (actor.mode === 'preview') {
    const store = previewStore(actor);
    return store.transaction(() => {
      if (store.db.prepare('SELECT 1 FROM preview_dealers WHERE username=?').get(data.username))
        throw new PortalError(409, 'USERNAME_EXISTS', 'This username is already in use.');
      validatePreviewCenters(store, data.centers);
      const id =
        Number(store.db.prepare('SELECT MAX(id) AS id FROM preview_dealers').get()!.id) + 1;
      store.db
        .prepare('INSERT INTO preview_dealers VALUES (?,?,?,?,?,?,?)')
        .run(
          id,
          data.name,
          data.username,
          data.email,
          Number(data.active),
          Number(data.isSuperAdmin),
          new Date().toISOString().slice(0, 10),
        );
      savePreviewLinks(store, id, data.centers);
      return previewDealerDetail(store, id)!;
    });
  }
  if (!dealerWritesEnabled())
    throw new PortalError(
      503,
      'DEALER_WRITES_DISABLED',
      'Dealer changes are not enabled in this environment.',
    );
  const store = getStore(),
    operation = startOperation(store, actor, null, 'created');
  const transaction = new sql.Transaction(await getPool('secure'));
  let commitAttempted = false,
    createdId: number | null = null;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const saved = await createDealerInTransaction(transaction, actor, data);
    createdId = saved.id;
    commitAttempted = true;
    await transaction.commit();
    finishOperation(store, operation, 'committed', createdId);
    return saved;
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    finishOperation(store, operation, commitAttempted ? 'unconfirmed' : 'failed', createdId);
    throw error;
  }
}
export async function updateDealer(
  actor: PortalActor,
  id: number,
  data: DealerUpdate,
): Promise<DealerDetail> {
  assertDealerAdministrator(actor);
  if (actor.mode === 'preview') {
    const store = previewStore(actor);
    return store.transaction(() => {
      const current = previewDealerDetail(store, id) ?? notFound();
      if (current.revision !== data.revision) conflict();
      lifecycle(
        actor,
        current,
        data,
        Number(
          store.db
            .prepare('SELECT COUNT(*) AS n FROM preview_dealers WHERE active=1 AND is_admin=1')
            .get()!.n,
        ),
      );
      validatePreviewCenters(store, data.centers);
      if (id !== actor.dealerId && changedAccess(current, data))
        store.revokeDealerSessions(id, 'preview');
      store.db
        .prepare('UPDATE preview_dealers SET name=?,email=?,active=?,is_admin=? WHERE id=?')
        .run(data.name, data.email, Number(data.active), Number(data.isSuperAdmin), id);
      savePreviewLinks(store, id, data.centers);
      return previewDealerDetail(store, id)!;
    });
  }
  if (!dealerWritesEnabled())
    throw new PortalError(
      503,
      'DEALER_WRITES_DISABLED',
      'Dealer changes are not enabled in this environment.',
    );
  const store = getStore(),
    operation = startOperation(store, actor, id, 'updated');
  const transaction = new sql.Transaction(await getPool('secure'));
  let commitAttempted = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    // Revoke before commit, so a storage outage cannot leave reusable old tokens
    // across a disable/re-enable cycle. A failed SQL change may require signing in again.
    const saved = await updateDealerInTransaction(transaction, actor, id, data, () =>
      store.revokeDealerSessions(id, 'legacy'),
    );
    commitAttempted = true;
    await transaction.commit();
    finishOperation(store, operation, 'committed', id);
    return saved;
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    finishOperation(store, operation, commitAttempted ? 'unconfirmed' : 'failed', id);
    throw error;
  }
}
