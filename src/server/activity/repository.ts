import 'server-only';
import sql from 'mssql';
import {
  assertPermission,
  hasPermission,
  AccessDeniedError,
  centerGrants,
  type PortalActor,
} from '@/domain/access';
import { type CenterRef } from '@/domain/centers';
import {
  aggregateActivity,
  reportWindow,
  type ActivityCenter,
  type ActivityQuery,
  type ActivityReport,
  type ActivationEvent,
  type Member,
} from '@/domain/activity';
import { getPool } from '@/server/db/pools';
import { demoDealer } from '@/server/auth/dealers';
import { getStore } from '@/server/store';
import { PortalError } from '@/server/http';

type Row = Record<string, unknown>;
const scope = `EXISTS(SELECT 1 FROM icare_secure.dbo.Dealers a WHERE a.dealer_id=@actor AND a.is_active=1 AND
 (a.is_super_admin=1 OR EXISTS(SELECT 1 FROM icare_secure.dbo.Dealer_Centers l WHERE l.dealer_id=a.dealer_id AND l.center_id=c.center_id AND l.center_type=c.type)
 OR (c.type IN(1,3) AND EXISTS(SELECT 1 FROM icare_secure.dbo.Dealer_Page_Center_Access p WHERE p.dealer_id=a.dealer_id AND p.center_id=c.center_id AND p.center_type=c.type AND p.page_id=7))))`;
const centers = `SELECT c.center_id,CONVERT(int,c.type) AS type,c.center_name FROM icare.dbo.Care_Center c WHERE c.type IN(1,3) AND ${scope}
 UNION ALL SELECT c.center_id,CONVERT(int,c.type),c.center_name FROM icare_school.dbo.Care_Center c WHERE c.type=4 AND ${scope}`;
function previewActor(actor: PortalActor) {
  const identity = demoDealer(actor.dealerId);
  if (!identity) throw new AccessDeniedError();
  return {
    ...actor,
    isSuperAdmin: identity.isSuperAdmin,
    grants: centerGrants(identity.isSuperAdmin, identity.ownedKeys, identity.reportKeys),
  };
}
export async function activityContext(actor: PortalActor, ref?: CenterRef) {
  if (ref) assertPermission(actor, 'reports.read', ref);
  if (actor.mode === 'preview') {
    const actual = previewActor(actor);
    if (ref) assertPermission(actual, 'reports.read', ref);
    const options = getStore()
      .previewCenters()
      .filter((c) => hasPermission(actual, 'reports.read', c));
    const selected = ref ? options.find((c) => c.id === ref.id && c.type === ref.type) : null;
    if (ref && !selected) throw new PortalError(404, 'CENTER_NOT_FOUND', 'Center not found.');
    return {
      asOf: new Date().toISOString().slice(0, 10),
      center: selected
        ? {
            id: selected.id,
            type: selected.type,
            name: selected.profile.name,
            domain: selected.domain,
            active: selected.active,
          }
        : null,
    };
  }
  const result = await (
    await getPool('secure')
  )
    .request()
    .input('actor', sql.Int, actor.dealerId)
    .input('id', sql.Int, ref?.id ?? 0)
    .input('type', sql.Int, ref?.type ?? 0).query(`
    SELECT CONVERT(varchar(10),GETDATE(),23) AS as_of;
    WITH Centers AS(${centers}) SELECT c.*,d.center_domain,s.activation_status FROM Centers c
    OUTER APPLY(SELECT TOP(1) center_domain FROM dbo.Center_Domains d WHERE d.center_id=c.center_id AND d.center_type=c.type ORDER BY ID DESC)d
    OUTER APPLY(SELECT TOP(1) activation_status FROM dbo.Center_Status s WHERE s.center_id=c.center_id AND s.center_type=c.type ORDER BY ID DESC)s
    WHERE c.center_id=@id AND c.type=@type;`);
  const sets = result.recordsets as unknown as Row[][],
    row = sets[1][0];
  if (ref && !row) throw new AccessDeniedError();
  return {
    asOf: String(sets[0][0].as_of),
    center: row
      ? {
          id: Number(row.center_id),
          type: Number(row.type) as 1 | 3 | 4,
          name: String(row.center_name),
          domain: String(row.center_domain ?? ''),
          active: row.activation_status == null ? null : Number(row.activation_status) === 1,
        }
      : null,
  };
}
export async function activityCenters(
  actor: PortalActor,
  query: { q: string; type: string; status: string; dealerId?: number; page: number },
) {
  const pageSize = 12;
  if (actor.mode === 'preview') {
    const actual = previewActor(actor);
    if (query.dealerId && !actual.isSuperAdmin) throw new AccessDeniedError();
    const rows = getStore()
      .previewCenters()
      .filter((c) => hasPermission(actual, 'reports.read', c))
      .filter(
        (c) =>
          (!query.q ||
            `${c.profile.name} ${c.domain} ${c.id}`
              .toLowerCase()
              .includes(query.q.toLowerCase())) &&
          (query.type === 'all' || c.type === Number(query.type)) &&
          (query.status === 'all' ||
            (query.status === 'unknown'
              ? c.active === null
              : c.active === (query.status === 'active'))) &&
          (!query.dealerId ||
            getStore()
              .db.prepare(
                'SELECT 1 FROM preview_dealer_centers WHERE dealer_id=? AND center_id=? AND center_type=?',
              )
              .get(query.dealerId, c.id, c.type)),
      )
      .map((c) => ({
        id: c.id,
        type: c.type,
        name: c.profile.name,
        domain: c.domain,
        active: c.active,
      }))
      .sort((a, b) => a.name.localeCompare(b.name) || a.id - b.id);
    return {
      items: rows.slice((query.page - 1) * pageSize, query.page * pageSize),
      total: rows.length,
      page: query.page,
      pageSize,
    };
  }
  const request = (await getPool('secure'))
    .request()
    .input('actor', sql.Int, actor.dealerId)
    .input('q', sql.NVarChar(400), `%${query.q.replace(/[\[%_]/g, (c) => `[${c}]`)}%`)
    .input('type', sql.Int, query.type === 'all' ? null : Number(query.type))
    .input('status', sql.NVarChar(10), query.status)
    .input('dealer', sql.Int, query.dealerId ?? null)
    .input('offset', sql.Int, (query.page - 1) * pageSize)
    .input('limit', sql.Int, pageSize);
  const data = `SELECT b.*,d.center_domain,s.activation_status FROM (${centers}) b
    OUTER APPLY(SELECT TOP(1) center_domain FROM icare_secure.dbo.Center_Domains d WHERE d.center_id=b.center_id AND d.center_type=b.type ORDER BY ID DESC)d
    OUTER APPLY(SELECT TOP(1) activation_status FROM icare_secure.dbo.Center_Status s WHERE s.center_id=b.center_id AND s.center_type=b.type ORDER BY ID DESC)s
    WHERE (@type IS NULL OR b.type=@type) AND (b.center_name LIKE @q OR d.center_domain LIKE @q OR CONVERT(varchar(12),b.center_id) LIKE @q)
      AND (@status='all' OR (@status='unknown' AND s.activation_status IS NULL) OR (@status='active' AND s.activation_status=1) OR (@status='inactive' AND s.activation_status<>1))
      AND (@dealer IS NULL OR EXISTS(SELECT 1 FROM icare_secure.dbo.Dealer_Centers l WHERE l.dealer_id=@dealer AND l.center_id=b.center_id AND l.center_type=b.type))`;
  const result =
    await request.query(`IF @dealer IS NOT NULL AND NOT EXISTS(SELECT 1 FROM dbo.Dealers WHERE dealer_id=@actor AND is_active=1 AND is_super_admin=1) THROW 51031,'Admin filter denied',1;
    WITH Filtered AS(${data}) SELECT COUNT(*) AS total FROM Filtered;
    WITH Filtered AS(${data}) SELECT * FROM Filtered ORDER BY center_name,center_id,type OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`);
  const sets = result.recordsets as unknown as Row[][];
  return {
    items: sets[1].map((r) => ({
      id: Number(r.center_id),
      type: Number(r.type) as 1 | 3 | 4,
      name: String(r.center_name),
      domain: String(r.center_domain ?? ''),
      active: r.activation_status == null ? null : Number(r.activation_status) === 1,
    })),
    total: Number(sets[0][0].total),
    page: query.page,
    pageSize,
  };
}
export async function activityDealers(actor: PortalActor) {
  if (actor.mode === 'preview') {
    const actual = previewActor(actor);
    return actual.isSuperAdmin
      ? getStore()
          .db.prepare('SELECT id,name FROM preview_dealers WHERE active=1 ORDER BY name')
          .all()
      : [];
  }
  const result = await (await getPool('secure')).request().input('actor', sql.Int, actor.dealerId)
    .query(`SELECT dealer_id AS id,dealer_name AS name FROM dbo.Dealers
    WHERE is_active=1 AND EXISTS(SELECT 1 FROM dbo.Dealers a WHERE a.dealer_id=@actor AND a.is_active=1 AND a.is_super_admin=1) ORDER BY dealer_name,dealer_id;`);
  return result.recordset;
}
export async function academicYears(actor: PortalActor, ref: CenterRef) {
  await activityContext(actor, ref);
  if (ref.type !== 4) return [];
  if (actor.mode === 'preview')
    return [
      { id: 2026, title: '2026–2027' },
      { id: 2025, title: '2025–2026' },
    ];
  const result = await (
    await getPool('secure')
  )
    .request()
    .query(
      'SELECT academic_year_id AS id,academic_year_title AS title FROM icare_school.dbo.Academic_Years ORDER BY academic_year_id DESC',
    );
  return result.recordset.map((r) => ({ id: Number(r.id), title: String(r.title) }));
}
function windowFor(query: ActivityQuery, asOf: string) {
  try {
    return reportWindow(query.period, asOf);
  } catch {
    throw new PortalError(422, 'FUTURE_PERIOD', 'Choose the current month or an earlier month.');
  }
}
function previewReport(center: ActivityCenter, query: ActivityQuery, asOf: string): ActivityReport {
  const prefix = query.period,
    w = windowFor(query, asOf),
    classes = [
      { id: 1, name: 'Discoverers' },
      { id: 2, name: 'Explorers' },
    ];
  const members: Member[] = [
    { classId: 1, childId: 1, demo: false },
    { classId: 1, childId: 2, demo: false },
    { classId: 1, childId: 3, demo: true },
    { classId: 2, childId: 4, demo: false },
    { classId: 2, childId: 5, demo: false },
    { classId: 2, childId: 6, demo: true },
  ];
  const stamp = (day: number) =>
    `${prefix}-${String(Math.min(day, Number(w.end.slice(8)))).padStart(2, '0')} 09:00:00.000`;
  const events: ActivationEvent[] = [
    { childId: 1, id: 1, stamp: stamp(1), code: 1, restoreActive: null },
    { childId: 1, id: 2, stamp: stamp(6), code: 3, restoreActive: null },
    { childId: 2, id: 3, stamp: stamp(1), code: 2, restoreActive: null },
    { childId: 2, id: 4, stamp: stamp(14), code: 3, restoreActive: null },
    { childId: 4, id: 5, stamp: query.period + '-01 00:00:00.000', code: 3, restoreActive: null },
    { childId: 5, id: 6, stamp: stamp(3), code: 2, restoreActive: null },
    { childId: 5, id: 7, stamp: stamp(3), code: 3, restoreActive: null },
  ];
  return aggregateActivity(
    center,
    query,
    asOf,
    classes,
    members,
    events,
    query.centerType === 4
      ? {
          id: query.academicYearId!,
          title: query.academicYearId === 2026 ? '2026–2027' : '2025–2026',
        }
      : null,
  );
}
export async function getActivity(
  actor: PortalActor,
  query: ActivityQuery,
): Promise<ActivityReport> {
  const ref = { id: query.centerId, type: query.centerType },
    context = await activityContext(actor, ref),
    window = windowFor(query, context.asOf);
  if (query.centerType === 4) {
    const years = await academicYears(actor, ref);
    if (!years.some((y) => y.id === query.academicYearId))
      throw new PortalError(422, 'YEAR_UNAVAILABLE', 'Choose an available academic year.');
  }
  if (actor.mode === 'preview') return previewReport(context.center!, query, context.asOf);
  const db = ref.type === 4 ? 'icare_school' : 'icare',
    codes = ref.type === 4 ? '1,2,3' : '1,2,3,5,6';
  const restore = ref.type === 4 ? 'CAST(NULL AS bit)' : 't.child_is_active_on_restore';
  const transaction = new sql.Transaction(await getPool('secure'));
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const result = await new sql.Request(transaction)
      .input('actor', sql.Int, actor.dealerId)
      .input('id', sql.Int, ref.id)
      .input('type', sql.Int, ref.type)
      .input('start', sql.Date, window.start)
      .input('cutoff', sql.Date, window.end)
      .input('year', sql.Int, query.academicYearId ?? null)
      .input('deleted', sql.Bit, query.includeDeleted === 'true')
      .query(`SET NOCOUNT ON;SET LOCK_TIMEOUT 5000;
      IF NOT EXISTS(SELECT 1 FROM ${db}.dbo.Care_Center c WHERE c.center_id=@id AND c.type=@type AND ${scope}) THROW 51031,'Report access denied',1;
      DECLARE @Members TABLE(class_id int,child_id int,is_demo bit,duplicates int,PRIMARY KEY(class_id,child_id));
      INSERT @Members SELECT cl.class_id,ch.child_id,CONVERT(bit,MAX(CONVERT(int,ISNULL(ch.is_demo,0)))),COUNT(*)-1
        FROM ${db}.dbo.Class cl JOIN ${db}.dbo.Class_Child cc ON cc.Class_ID=cl.class_id
        JOIN ${db}.dbo.Child ch ON ch.child_id=cc.Child_ID JOIN ${db}.dbo.Parent p ON p.parent_id=ch.parent_id AND p.center_id=@id
        WHERE cl.center_id=@id AND (${ref.type === 4 ? 'cc.academic_year_id=@year' : '1=1'})
          AND (${ref.type === 4 ? '1=1' : 'CONVERT(date,ch.creation_date)<=@cutoff'})
          AND (@deleted=1 OR (ISNULL(cl.deleted,0)=0 AND ISNULL(ch.deleted,0)=0 AND ISNULL(p.deleted,0)=0))
        GROUP BY cl.class_id,ch.child_id;
      IF (SELECT COUNT(*) FROM @Members)>10000 THROW 51032,'Report capacity limit',1;
      DECLARE @Children TABLE(child_id int PRIMARY KEY);INSERT @Children SELECT DISTINCT child_id FROM @Members;
      SELECT class_id AS id,class_name AS name FROM ${db}.dbo.Class WHERE center_id=@id AND (@deleted=1 OR ISNULL(deleted,0)=0) ORDER BY class_name,class_id;
      SELECT m.*,
        CASE WHEN EXISTS(SELECT 1 FROM ${db}.dbo.Child_Transactions t WHERE t.child_id=m.child_id AND t.transaction_code IN(${codes})
          AND t.center_id IS NOT NULL AND t.center_id<>@id AND (t.transaction_date<DATEADD(day,1,@cutoff) OR t.transaction_date IS NULL)) THEN 1 ELSE 0 END AS outside_history,
        CASE WHEN EXISTS(SELECT 1 FROM ${db}.dbo.Child_Transactions t WHERE t.child_id=m.child_id AND t.transaction_code IN(${codes})
          AND (t.center_id=@id OR t.center_id IS NULL) AND t.transaction_date IS NULL) THEN 1 ELSE 0 END AS invalid_history
        FROM @Members m;
      WITH History AS(SELECT t.ID,t.child_id,t.transaction_code,t.transaction_date,${restore} AS restore_active,
        CASE WHEN t.center_id IS NULL THEN 1 ELSE 0 END AS centerless
        FROM ${db}.dbo.Child_Transactions t JOIN @Children eligible ON eligible.child_id=t.child_id
        WHERE (t.center_id=@id OR t.center_id IS NULL) AND t.transaction_code IN(${codes}) AND t.transaction_date IS NOT NULL
          AND t.transaction_date<DATEADD(month,1,@start)),
      Latest AS(SELECT child_id,MAX(transaction_date) AS stamp FROM History WHERE transaction_date<@start GROUP BY child_id)
      SELECT TOP(200001) h.ID,h.child_id,h.transaction_code,CONVERT(varchar(23),h.transaction_date,121) AS stamp,h.restore_active,h.centerless
        FROM History h LEFT JOIN Latest prior ON prior.child_id=h.child_id
        WHERE h.transaction_date>=@start OR h.transaction_date=prior.stamp ORDER BY h.child_id,h.transaction_date,h.ID;
      SELECT academic_year_id AS id,academic_year_title AS title FROM ${db}.dbo.Academic_Years WHERE academic_year_id=@year;`);
    const sets = result.recordsets as unknown as Row[][];
    if (sets[2].length > 200000)
      throw new PortalError(
        422,
        'REPORT_LIMIT',
        'This period has too many events for an interactive report.',
      );
    await transaction.commit();
    return aggregateActivity(
      context.center!,
      query,
      context.asOf,
      sets[0].map((r) => ({ id: Number(r.id), name: String(r.name ?? 'Unnamed class') })),
      sets[1].map((r) => ({
        classId: Number(r.class_id),
        childId: Number(r.child_id),
        demo: r.is_demo === true,
        duplicates: Number(r.duplicates),
        outsideHistory: Boolean(r.outside_history),
        invalidHistory: Boolean(r.invalid_history),
      })),
      sets[2].map((r) => ({
        childId: Number(r.child_id),
        id: Number(r.ID),
        stamp: String(r.stamp),
        code: Number(r.transaction_code),
        restoreActive: r.restore_active == null ? null : r.restore_active === true,
        centerless: Boolean(r.centerless),
      })),
      ref.type === 4 && sets[3][0]
        ? { id: Number(sets[3][0].id), title: String(sets[3][0].title) }
        : null,
    );
  } catch (error) {
    await transaction.rollback().catch(() => {});
    const number = (error as { number?: number }).number;
    if (number === 51031) throw new AccessDeniedError();
    if (number === 51032)
      throw new PortalError(
        422,
        'REPORT_LIMIT',
        'This center exceeds the interactive report capacity.',
      );
    throw error;
  }
}
