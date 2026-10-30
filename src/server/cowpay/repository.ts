import 'server-only';
import sql from 'mssql';
import {
  assertCapability,
  assertPermission,
  centerGrants,
  hasPermission,
  AccessDeniedError,
  type PortalActor,
} from '@/domain/access';
import { centerKey } from '@/domain/centers';
import {
  cowpayQuerySchema,
  cowpayRefSchema,
  cowpayState,
  type CowpayQuery,
  type CowpaySummary,
  type CowpayDirectory,
  type CowpayDetail,
  type CowpayObservation,
} from '@/domain/cowpay';
import { demoDealer } from '@/server/auth/dealers';
import { previewDealerDetail } from '@/server/dealers/preview';
import { getPool } from '@/server/db/pools';
import { getStore } from '@/server/store';
import { PortalError } from '@/server/http';
import { cowpayCallback } from './configuration';

type Ref = ReturnType<typeof cowpayRefSchema.parse>;
type Row = Record<string, unknown>;
const PAGE_SIZE = 12;
const missing = () =>
  new PortalError(
    404,
    'COWPAY_CENTER_NOT_FOUND',
    'This center is unavailable or outside your CowPay access.',
  );
// No secret values, partial masks, lengths, hashes or customer defaults leave SQL.
const observation = `OUTER APPLY (SELECT COUNT(*) row_count,
  CASE WHEN COUNT(*)=COUNT(s.center_type) AND MIN(s.center_type)=c.type AND MAX(s.center_type)=c.type THEN 0 ELSE COUNT(*) END type_mismatch,
  COALESCE(MAX(CASE WHEN NULLIF(LTRIM(RTRIM(s.merchant_code)),N'') IS NOT NULL THEN 1 ELSE 0 END),0) merchant_code_present,
  COALESCE(MAX(CASE WHEN NULLIF(LTRIM(RTRIM(s.merchant_hash_key)),N'') IS NOT NULL THEN 1 ELSE 0 END),0) merchant_hash_present,
  COALESCE(MAX(CASE WHEN NULLIF(LTRIM(RTRIM(s.access_token)),N'') IS NOT NULL THEN 1 ELSE 0 END),0) live_token_present,
  COALESCE(MAX(CASE WHEN NULLIF(LTRIM(RTRIM(s.staging_access_token)),N'') IS NOT NULL THEN 1 ELSE 0 END),0) staging_token_present,
  COUNT(s.is_enabled) enabled_known,MAX(CONVERT(int,s.is_enabled)) enabled_value,CONVERT(varchar(23),MAX(s.update_time),126)+'Z' updated_at
  FROM icare.dbo.Cowpay_Center_Api_Settings s WHERE s.center_id=c.center_id) settings`;
const projection = `c.center_id,c.type,c.center_name,settings.row_count,settings.type_mismatch,settings.merchant_code_present,settings.merchant_hash_present,settings.live_token_present,settings.staging_token_present,settings.enabled_known,settings.enabled_value,settings.updated_at`;
const scope = `EXISTS(SELECT 1 FROM icare_secure.dbo.Dealers a WHERE a.dealer_id=@actor AND a.is_active=1 AND (a.is_super_admin=1 OR EXISTS(SELECT 1 FROM icare_secure.dbo.Dealer_Centers l WHERE l.dealer_id=a.dealer_id AND l.center_id=c.center_id AND l.center_type=c.type)))`;
function observed(row: Row): CowpayObservation {
  const date = row.updated_at;
  return {
    rowCount: Number(row.row_count),
    typeMismatch: Number(row.type_mismatch),
    merchantCode: Number(row.merchant_code_present),
    merchantHash: Number(row.merchant_hash_present),
    liveToken: Number(row.live_token_present),
    stagingToken: Number(row.staging_token_present),
    enabledKnown: Number(row.enabled_known),
    enabledValue: row.enabled_value == null ? null : Number(row.enabled_value),
    updatedAt:
      date instanceof Date && Number.isFinite(date.getTime())
        ? date.toISOString()
        : typeof date === 'string'
          ? date
          : null,
  };
}
function summary(row: Row): CowpaySummary {
  const ref = cowpayRefSchema.parse({ id: Number(row.center_id), type: Number(row.type) });
  return { center: { ...ref, name: String(row.center_name) }, ...cowpayState(observed(row)) };
}
function previewActor(actor: PortalActor): PortalActor {
  const identity = previewDealerDetail(getStore(), actor.dealerId);
  if (!identity?.active || actor.mode !== 'preview') throw new AccessDeniedError();
  return {
    ...actor,
    isSuperAdmin: identity.isSuperAdmin,
    grants: centerGrants(identity.isSuperAdmin, identity.centers.map(centerKey)),
  };
}
function seedPreview() {
  // Presence-only fictional fixtures, never credentials or live configuration mirrors.
  const store = getStore();
  const insert = store.db.prepare(
    'INSERT OR IGNORE INTO preview_cowpay_readiness VALUES(?,?,?,?,?,?,?,?,?,?,?)',
  );
  for (const c of store.db
    .prepare('SELECT id,type FROM preview_centers WHERE type IN(1,3)')
    .all()) {
    const id = Number(c.id),
      type = Number(c.type);
    if (id === 101) insert.run(id, type, 1, 0, 1, 1, 1, 1, 1, 1, '2026-10-21T12:00:00.000Z');
    else if (id === 103) insert.run(id, type, 1, 0, 1, 1, 0, 1, 1, 0, '2026-10-21T12:00:00.000Z');
    else if (id === 106) insert.run(id, type, 2, 0, 1, 1, 1, 0, 2, 1, '2026-10-21T12:00:00.000Z');
    else insert.run(id, type, 0, 0, 0, 0, 0, 0, 0, null, null);
  }
}
function previewRows(actor: PortalActor) {
  return getStore()
    .db.prepare(
      `SELECT c.id center_id,c.type,c.profile,p.row_count,p.type_mismatch,p.merchant_code_present,p.merchant_hash_present,p.live_token_present,p.staging_token_present,p.enabled_known,p.enabled_value,p.updated_at FROM preview_centers c JOIN preview_cowpay_readiness p ON p.center_id=c.id AND p.center_type=c.type WHERE c.type IN(1,3)`,
    )
    .all()
    .filter((row) =>
      hasPermission(actor, 'integrations.read', {
        id: Number(row.center_id),
        type: Number(row.type) as 1 | 3,
      }),
    )
    .map((row) => summary({ ...row, center_name: String(JSON.parse(String(row.profile)).name) }));
}
export async function listCowpay(actor: PortalActor, input: CowpayQuery): Promise<CowpayDirectory> {
  assertCapability(actor, 'integrations.read');
  const query = cowpayQuerySchema.parse(input);
  if (actor.mode === 'preview') {
    demoDealer(actor.dealerId);
    return getStore().transaction(() => {
      actor = previewActor(actor);
      assertCapability(actor, 'integrations.read');
      seedPreview();
      const rows = previewRows(actor).filter(
        (row) =>
          (!query.q ||
            `${row.center.name} ${row.center.id}`.toLowerCase().includes(query.q.toLowerCase())) &&
          (query.type === 'all' || row.center.type === Number(query.type)) &&
          (query.setup === 'all' || row.setup === query.setup) &&
          (query.enabled === 'all' ||
            (query.enabled === 'unknown'
              ? row.storedEnabled === null
              : row.storedEnabled === (query.enabled === 'enabled'))),
      );
      rows.sort((a, b) =>
        query.sort === 'type'
          ? a.center.type - b.center.type ||
            a.center.name.localeCompare(b.center.name) ||
            a.center.id - b.center.id
          : (query.sort === 'name-desc' ? -1 : 1) * a.center.name.localeCompare(b.center.name) ||
            a.center.id - b.center.id,
      );
      return {
        items: rows.slice((query.page - 1) * PAGE_SIZE, query.page * PAGE_SIZE),
        total: rows.length,
        page: query.page,
        pageSize: PAGE_SIZE,
        summary: {
          liveComplete: rows.filter((r) => r.liveComplete).length,
          stagingComplete: rows.filter((r) => r.stagingComplete).length,
          enabled: rows.filter((r) => r.storedEnabled === true).length,
          review: rows.filter((r) => r.setup === 'review').length,
        },
        mode: 'preview',
        readOnly: true,
      };
    });
  }
  return listLiveCowpay(actor, query, await getPool('secure'));
}
function request(parent: sql.ConnectionPool | sql.Transaction, actor: PortalActor) {
  return (parent instanceof sql.Transaction ? new sql.Request(parent) : parent.request()).input(
    'actor',
    sql.Int,
    actor.dealerId,
  );
}
export async function listLiveCowpay(
  actor: PortalActor,
  input: CowpayQuery,
  parent: sql.ConnectionPool | sql.Transaction,
): Promise<CowpayDirectory> {
  assertCapability(actor, 'integrations.read');
  if (actor.mode !== 'legacy') throw new AccessDeniedError();
  const query = cowpayQuerySchema.parse(input);
  const filtered = `WITH Settings AS (
    SELECT ${projection} FROM icare.dbo.Care_Center c ${observation} WHERE c.type IN(1,3) AND ${scope}
    AND (@type IS NULL OR c.type=@type) AND (@search=N'%%' OR c.center_name LIKE @search OR CONVERT(varchar(12),c.center_id) LIKE @search)
  ), Readiness AS (SELECT *,
    CASE WHEN row_count=1 AND type_mismatch=0 AND merchant_code_present=1 AND merchant_hash_present=1 AND live_token_present=1 THEN 1 ELSE 0 END live_complete,
    CASE WHEN row_count=1 AND type_mismatch=0 AND merchant_code_present=1 AND merchant_hash_present=1 AND staging_token_present=1 THEN 1 ELSE 0 END staging_complete,
    CASE WHEN row_count=1 AND type_mismatch=0 AND enabled_known=1 THEN enabled_value ELSE NULL END stored_enabled,
    CASE WHEN row_count>1 OR type_mismatch>0 OR (row_count=1 AND enabled_known<>1) THEN 'review' WHEN row_count=0 THEN 'unconfigured' WHEN merchant_code_present=1 AND merchant_hash_present=1 AND (live_token_present=1 OR staging_token_present=1) THEN 'complete' ELSE 'incomplete' END setup
    FROM Settings), Filtered AS (SELECT * FROM Readiness WHERE (@setup='all' OR setup=@setup) AND (@enabled='all' OR (@enabled='unknown' AND stored_enabled IS NULL) OR (@enabled='enabled' AND stored_enabled=1) OR (@enabled='disabled' AND stored_enabled=0)))`;
  const sort =
    query.sort === 'type'
      ? 'type,center_name,center_id'
      : query.sort === 'name-desc'
        ? 'center_name DESC,center_id'
        : 'center_name,center_id';
  const result = await request(parent, actor)
    .input('type', sql.Int, query.type === 'all' ? null : Number(query.type))
    .input('search', sql.NVarChar(260), `%${query.q.replace(/[\[%_]/g, (c) => `[${c}]`)}%`)
    .input('setup', sql.VarChar(20), query.setup)
    .input('enabled', sql.VarChar(10), query.enabled)
    .input('offset', sql.Int, (query.page - 1) * PAGE_SIZE)
    .input('limit', sql.Int, PAGE_SIZE)
    .query(`${filtered} SELECT COUNT(*) total,COALESCE(SUM(live_complete),0) live_complete,COALESCE(SUM(staging_complete),0) staging_complete,COALESCE(SUM(CASE WHEN stored_enabled=1 THEN 1 ELSE 0 END),0) enabled,COALESCE(SUM(CASE WHEN setup='review' THEN 1 ELSE 0 END),0) review FROM Filtered;
    ${filtered} SELECT * FROM Filtered ORDER BY ${sort} OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`);
  const sets = result.recordsets as sql.IRecordSet<Row>[],
    counts = sets[0][0];
  return {
    items: sets[1].map(summary),
    total: Number(counts.total),
    page: query.page,
    pageSize: PAGE_SIZE,
    summary: {
      liveComplete: Number(counts.live_complete),
      stagingComplete: Number(counts.staging_complete),
      enabled: Number(counts.enabled),
      review: Number(counts.review),
    },
    mode: 'legacy',
    readOnly: true,
  };
}
export async function getCowpay(
  actor: PortalActor,
  input: { id: number; type: number },
): Promise<CowpayDetail> {
  const ref = cowpayRefSchema.parse(input);
  assertPermission(actor, 'integrations.read', ref);
  if (actor.mode === 'preview') {
    demoDealer(actor.dealerId);
    return getStore().transaction(() => {
      actor = previewActor(actor);
      assertPermission(actor, 'integrations.read', ref);
      seedPreview();
      const row = previewRows(actor).find(
        (r) => r.center.id === ref.id && r.center.type === ref.type,
      );
      if (!row) throw missing();
      return { ...row, mode: 'preview', callback: { state: 'pending', url: null }, readOnly: true };
    });
  }
  return getLiveCowpay(actor, ref, await getPool('secure'));
}
export async function getLiveCowpay(
  actor: PortalActor,
  input: { id: number; type: number },
  parent: sql.ConnectionPool | sql.Transaction,
): Promise<CowpayDetail> {
  const ref = cowpayRefSchema.parse(input);
  assertPermission(actor, 'integrations.read', ref);
  if (actor.mode !== 'legacy') throw new AccessDeniedError();
  const result = await request(parent, actor)
    .input('center', sql.Int, ref.id)
    .input('type', sql.Int, ref.type)
    .query(
      `SELECT ${projection} FROM icare.dbo.Care_Center c ${observation} WHERE c.center_id=@center AND c.type=@type AND ${scope};`,
    );
  if (result.recordset.length !== 1) throw missing();
  return {
    ...summary(result.recordset[0]),
    mode: 'legacy',
    callback: cowpayCallback(),
    readOnly: true,
  };
}
