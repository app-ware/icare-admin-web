import 'server-only';
import sql from 'mssql';
import { hasPermission, assertPermission, type PortalActor } from '@/domain/access';
import {
  centerKey,
  parseLegacyLocation,
  serializeLegacyLocation,
  type CenterRef,
} from '@/domain/centers';
import {
  type CenterProfile,
  type DirectoryQuery,
  type DirectoryResult,
  type ManagedCenter,
} from '@/domain/management';
import { getPool } from '@/server/db/pools';
import { getStore, digest } from '@/server/store';
import { centerWritesEnabled } from '@/server/runtime';
import { PortalError } from '@/server/http';

// Fixed projections from the inspected catalogs. No secret columns or request-selected SQL identifiers.
const fields = `c.center_id,c.type,c.center_name,c.center_manager,c.center_email,c.center_mobile,c.center_land_line,
 c.center_website,c.center_address,c.center_description,c.center_location`;
const scope = `EXISTS(SELECT 1 FROM icare_secure.dbo.Dealers actor WHERE actor.dealer_id=@actor AND actor.is_active=1
 AND (actor.is_super_admin=1 OR EXISTS(SELECT 1 FROM icare_secure.dbo.Dealer_Centers links
 WHERE links.dealer_id=actor.dealer_id AND links.center_id=c.center_id AND links.center_type=c.type)))`;
const joins = `OUTER APPLY(SELECT TOP(1) center_domain FROM icare_secure.dbo.Center_Domains domains WHERE domains.center_id=c.center_id AND domains.center_type=c.type ORDER BY domains.ID DESC) d
 OUTER APPLY(SELECT TOP(1) activation_status FROM icare_secure.dbo.Center_Status statuses WHERE statuses.center_id=c.center_id AND statuses.center_type=c.type ORDER BY statuses.ID DESC) s`;
const union = `SELECT ${fields},c.time_zone,d.center_domain,s.activation_status FROM icare.dbo.Care_Center c ${joins} WHERE c.type IN(1,3) AND ${scope}
 UNION ALL SELECT ${fields},CAST(NULL AS nvarchar(100)) AS time_zone,d.center_domain,s.activation_status FROM icare_school.dbo.Care_Center c ${joins} WHERE c.type=4 AND ${scope}`;
type Row = Record<string, unknown>;
function mapRow(row: Row, actor: PortalActor): ManagedCenter {
  const text = (key: string) => String(row[key] ?? '');
  let location = null;
  let invalidLocation = false;
  if (text('center_location')) {
    try {
      location = parseLegacyLocation(text('center_location'));
    } catch {
      invalidLocation = true;
    }
  }
  const profile: CenterProfile = {
    name: text('center_name'),
    manager: text('center_manager'),
    email: text('center_email'),
    mobile: text('center_mobile'),
    landline: text('center_land_line'),
    website: text('center_website'),
    address: text('center_address'),
    description: text('center_description'),
    location,
  };
  const ref = { id: Number(row.center_id), type: Number(row.type) as 1 | 3 | 4 };
  return {
    ...ref,
    domain: text('center_domain'),
    profile,
    active: row.activation_status == null ? null : Number(row.activation_status) === 1,
    timeZone: row.time_zone == null ? null : String(row.time_zone),
    revision: digest(JSON.stringify(profile) + text('center_location')),
    canEdit: centerWritesEnabled() && hasPermission(actor, 'centers.write', ref),
    invalidLocation,
  };
}
function previewList(actor: PortalActor) {
  return getStore()
    .previewCenters()
    .filter((c) => hasPermission(actor, 'centers.read', c))
    .map(({ ownerId, ...center }) => ({
      ...center,
      canEdit: hasPermission(actor, 'centers.write', center),
    }));
}
export async function listCenters(
  actor: PortalActor,
  query: DirectoryQuery,
): Promise<DirectoryResult> {
  const pageSize = 12;
  if (actor.mode === 'preview') {
    const filtered = previewList(actor).filter(
      (c) =>
        (!query.q ||
          `${c.profile.name} ${c.domain} ${c.id}`.toLowerCase().includes(query.q.toLowerCase())) &&
        (query.type === 'all' || c.type === Number(query.type)) &&
        (query.status === 'all' ||
          (query.status === 'unknown'
            ? c.active === null
            : c.active === (query.status === 'active'))),
    );
    filtered.sort((a, b) =>
      query.sort === 'type'
        ? a.type - b.type || a.profile.name.localeCompare(b.profile.name)
        : (query.sort === 'name-desc' ? -1 : 1) * a.profile.name.localeCompare(b.profile.name),
    );
    return {
      items: filtered.slice((query.page - 1) * pageSize, query.page * pageSize),
      total: filtered.length,
      page: query.page,
      pageSize,
    };
  }
  const sort =
    query.sort === 'type'
      ? 'type,center_name,center_id'
      : query.sort === 'name-desc'
        ? 'center_name DESC,center_id,type'
        : 'center_name,center_id,type';
  const request = (await getPool('secure'))
    .request()
    .input('actor', sql.Int, actor.dealerId)
    .input('search', sql.NVarChar(400), `%${query.q.replace(/[\[%_]/g, (c) => `[${c}]`)}%`)
    .input('type', sql.Int, query.type === 'all' ? null : Number(query.type))
    .input('status', sql.NVarChar(10), query.status)
    .input('offset', sql.Int, (query.page - 1) * pageSize)
    .input('limit', sql.Int, pageSize);
  const result = await request.query(`WITH Centers AS(${union})
    SELECT *,COUNT(*) OVER() AS total_count FROM Centers WHERE (center_name LIKE @search OR center_domain LIKE @search OR CONVERT(varchar(12),center_id) LIKE @search)
    AND (@type IS NULL OR type=@type) AND (@status='all' OR (@status='unknown' AND activation_status IS NULL) OR (@status='active' AND activation_status=1) OR (@status='inactive' AND activation_status<>1))
    ORDER BY ${sort} OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY;`);
  return {
    items: result.recordset.map((r) => mapRow(r, actor)),
    total: Number(result.recordset[0]?.total_count ?? 0),
    page: query.page,
    pageSize,
  };
}
export async function getCenter(actor: PortalActor, ref: CenterRef): Promise<ManagedCenter> {
  assertPermission(actor, 'centers.read', ref);
  if (actor.mode === 'preview') {
    const center = previewList(actor).find((c) => centerKey(c) === centerKey(ref));
    if (!center) throw new PortalError(404, 'NOT_FOUND', 'Center not found.');
    return center;
  }
  const result = await (
    await getPool('secure')
  )
    .request()
    .input('actor', sql.Int, actor.dealerId)
    .input('id', sql.Int, ref.id)
    .input('type', sql.Int, ref.type)
    .query(`WITH Centers AS(${union}) SELECT * FROM Centers WHERE center_id=@id AND type=@type;`);
  if (result.recordset.length !== 1) throw new PortalError(404, 'NOT_FOUND', 'Center not found.');
  return mapRow(result.recordset[0], actor);
}
export async function updateCenter(
  actor: PortalActor,
  ref: CenterRef,
  revision: string,
  profile: CenterProfile,
) {
  assertPermission(actor, 'centers.write', ref);
  if (actor.mode === 'preview') {
    getStore().updatePreview(ref, revision, profile);
    return getCenter(actor, ref);
  }
  if (!centerWritesEnabled())
    throw new PortalError(
      503,
      'CENTER_WRITES_DISABLED',
      'Profile updates are not enabled in this environment.',
    );
  const catalog = ref.type === 4 ? 'icare_school' : 'icare';
  const transaction = new sql.Transaction(await getPool('secure'));
  await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
  try {
    const request = new sql.Request(transaction)
      .input('actor', sql.Int, actor.dealerId)
      .input('id', sql.Int, ref.id)
      .input('type', sql.Int, ref.type);
    const result = await request.query(
      `SELECT ${fields},${ref.type === 4 ? 'CAST(NULL AS nvarchar(100))' : 'c.time_zone'} AS time_zone FROM ${catalog}.dbo.Care_Center c WITH(UPDLOCK,HOLDLOCK) WHERE c.center_id=@id AND c.type=@type AND ${scope};`,
    );
    if (result.recordset.length !== 1) throw new PortalError(404, 'NOT_FOUND', 'Center not found.');
    const current = mapRow(result.recordset[0], actor);
    if (current.revision !== revision)
      throw new PortalError(
        409,
        'REVISION_CONFLICT',
        'This center changed while you were editing. Reload the latest details before saving.',
      );
    const values = {
      center_name: profile.name,
      center_manager: profile.manager,
      center_email: profile.email,
      center_mobile: profile.mobile,
      center_land_line: profile.landline,
      center_website: profile.website,
      center_address: profile.address,
      center_description: profile.description,
      center_location: profile.location
        ? serializeLegacyLocation(profile.location)
        : current.invalidLocation
          ? String(result.recordset[0].center_location)
          : '',
    };
    const update = new sql.Request(transaction)
      .input('actor', sql.Int, actor.dealerId)
      .input('id', sql.Int, ref.id)
      .input('type', sql.Int, ref.type);
    for (const [key, value] of Object.entries(values))
      update.input(key, sql.NVarChar(key === 'center_website' ? 250 : sql.MAX), value);
    const changed = await update.query(
      `DECLARE @changed TABLE(center_id int); UPDATE c SET ${Object.keys(values)
        .map((key) => `${key}=@${key}`)
        .join(
          ',',
        )} OUTPUT inserted.center_id INTO @changed FROM ${catalog}.dbo.Care_Center c WHERE c.center_id=@id AND c.type=@type AND ${scope}; SELECT COUNT(*) AS changed_count FROM @changed;`,
    );
    if (changed.recordset[0]?.changed_count !== 1)
      throw new PortalError(409, 'UPDATE_REJECTED', 'The update could not be confirmed.');
    await transaction.commit();
  } catch (error) {
    await transaction.rollback().catch(() => undefined);
    throw error;
  }
  return getCenter(actor, ref);
}
