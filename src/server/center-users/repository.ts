import 'server-only';
import sql from 'mssql';
import { randomUUID } from 'node:crypto';
import {
  assertPermission,
  hasPermission,
  AccessDeniedError,
  centerGrants,
  type PortalActor,
} from '@/domain/access';
import { centerKey, operationalDatabase, type CenterRef } from '@/domain/centers';
import {
  assertCenterUserUpdate,
  CenterUserPolicyError,
  type CenterUser,
  type CenterUserDirectory,
  type CenterUserQuery,
  type CenterUserUpdate,
  type UserMappingIssue,
} from '@/domain/center-users';
import { getPool } from '@/server/db/pools';
import { getCenter, listCenters } from '@/server/centers/repository';
import { directoryQuerySchema } from '@/domain/management';
import { demoDealer } from '@/server/auth/dealers';
import { getStore, digest, type PortalStore } from '@/server/store';
import { centerUserWritesEnabled } from '@/server/runtime';
import { PortalError } from '@/server/http';
import { seedCenterUsers, previewUserRows } from './preview';

type Row = Record<string, unknown>;
const SQL_USER_LIMIT = 5000;
const scope = `EXISTS(SELECT 1 FROM icare_secure.dbo.Dealers actor WHERE actor.dealer_id=@actor AND actor.is_active=1
  AND (actor.is_super_admin=1 OR EXISTS(SELECT 1 FROM icare_secure.dbo.Dealer_Centers links
    WHERE links.dealer_id=actor.dealer_id AND links.center_id=@centerId AND links.center_type=@centerType)))
  AND EXISTS(SELECT 1 FROM icare.dbo.Care_Center c WHERE c.center_id=@centerId AND c.type=@centerType AND @centerType IN(1,3)
    UNION ALL SELECT 1 FROM icare_school.dbo.Care_Center c WHERE c.center_id=@centerId AND c.type=4 AND @centerType=4)`;
const adminScope = `EXISTS(SELECT 1 FROM icare_secure.dbo.Dealers actor WHERE actor.dealer_id=@actor AND actor.is_active=1 AND actor.is_super_admin=1)`;
function catalog(ref: CenterRef) {
  return operationalDatabase(ref.type) === 'school' ? 'icare_school' : 'icare';
}
function membership(db: string) {
  return `(u.center_id=@centerId
  OR EXISTS(SELECT 1 FROM ${db}.dbo.secCareCenterUser member WHERE member.UserID=u.ID AND member.center_id=@centerId)
  OR (u.center_id IS NULL AND EXISTS(SELECT 1 FROM icare_secure.dbo.Center_Users member
    WHERE member.center_user_id=u.ID AND member.center_id=@centerId AND member.center_type=@centerType)))`;
}
function baseRequest(
  pool: sql.ConnectionPool | sql.Transaction,
  actor: PortalActor,
  ref: CenterRef,
) {
  const request = pool instanceof sql.Transaction ? new sql.Request(pool) : new sql.Request(pool);
  return request
    .input('actor', sql.Int, actor.dealerId)
    .input('centerId', sql.Int, ref.id)
    .input('centerType', sql.Int, ref.type);
}
function currentPreviewActor(actor: PortalActor) {
  const actual = demoDealer(actor.dealerId);
  if (!actual) throw new AccessDeniedError();
  return {
    ...actor,
    isSuperAdmin: actual.isSuperAdmin,
    grants: centerGrants(actual.isSuperAdmin, actual.ownedKeys),
  };
}
async function authorizedCenter(actor: PortalActor, ref: CenterRef) {
  assertPermission(actor, 'users.manage', ref);
  if (actor.mode === 'preview') assertPermission(currentPreviewActor(actor), 'users.manage', ref);
  return getCenter(actor, ref);
}
function decorate(
  data: Omit<CenterUser, 'revision' | 'canEdit' | 'canChangeSignIn' | 'mapping'>,
  actorAdmin: boolean,
  writable: boolean,
  version: unknown,
): CenterUser {
  const issues = [...data.issues];
  if (data.isSuperAdmin && !actorAdmin) issues.push('protected_account');
  const row = { ...data, issues };
  return {
    ...row,
    mapping: issues.some((issue) => issue !== 'protected_account')
      ? 'review'
      : data.secureId === null
        ? 'local'
        : 'linked',
    revision: digest(JSON.stringify([data, version])),
    canEdit: writable && data.localId !== null && !issues.length,
    canChangeSignIn: writable && data.localId !== null && data.secureId !== null && !issues.length,
  };
}
function mapSql(row: Row, roles: Row[], actorAdmin: boolean): CenterUser {
  const localId = row.local_id == null ? null : Number(row.local_id),
    secureId = row.secure_id == null ? null : Number(row.secure_id);
  const issues: UserMappingIssue[] = [];
  if (localId === null) issues.push('missing_local');
  if (Number(row.secure_matches) > 1) issues.push('multiple_secure');
  if (Number(row.shared_local)) issues.push('shared_local');
  if (Number(row.duplicate_names) > 1) issues.push('duplicate_username');
  if (secureId !== null && !String(row.username ?? '').trim()) issues.push('missing_username');
  const roleRows = roles
    .filter((r) => Number(r.UserID) === localId)
    .sort((a, b) => Number(a.RoleID) - Number(b.RoleID));
  return decorate(
    {
      key: String(row.user_key),
      localId,
      secureId,
      username: String(row.username ?? ''),
      localUsername: String(row.local_username ?? ''),
      firstName: String(row.first_name ?? ''),
      lastName: String(row.last_name ?? ''),
      email: String(row.email ?? ''),
      active: row.is_active == null ? null : row.is_active === true,
      isAdmin: row.is_admin == null ? null : row.is_admin === true,
      isSuperAdmin: row.is_super_admin === true,
      issues,
      roles: [...new Set(roleRows.map((r) => String(r.role_name ?? 'Missing role')))],
    },
    actorAdmin,
    centerUserWritesEnabled(),
    [row.secure_matches, row.shared_local, row.duplicate_names, roleRows],
  );
}
function mapPreview(row: Row, admin: boolean): CenterUser {
  return decorate(
    {
      key: row.local_id === null ? `s_${row.secure_id}` : `l_${row.local_id}`,
      localId: row.local_id === null ? null : Number(row.local_id),
      secureId: row.secure_id === null ? null : Number(row.secure_id),
      username: String(row.username),
      localUsername: String(row.local_username),
      firstName: String(row.first_name),
      lastName: String(row.last_name),
      email: String(row.email),
      active: row.active === null ? null : Boolean(row.active),
      isAdmin: row.is_admin === null ? null : Boolean(row.is_admin),
      isSuperAdmin: Boolean(row.is_super_admin),
      issues: JSON.parse(String(row.issues)),
      roles: JSON.parse(String(row.roles)),
    },
    admin,
    true,
    null,
  );
}
async function sqlRoster(
  actor: PortalActor,
  ref: CenterRef,
  transaction?: sql.Transaction,
): Promise<CenterUser[]> {
  const db = catalog(ref),
    member = membership(db),
    lock = transaction ? 'WITH(UPDLOCK,HOLDLOCK)' : '';
  const sameDatabaseTypes = ref.type === 4 ? '4' : '1,3';
  const result = await baseRequest(transaction ?? (await getPool('secure')), actor, ref).query(`
    SELECT CASE WHEN ${scope} THEN 1 ELSE 0 END AS allowed,CASE WHEN ${adminScope} THEN 1 ELSE 0 END AS actor_admin;
    SELECT TOP(5001) 'l_'+CONVERT(varchar(12),u.ID) AS user_key,u.ID AS local_id,s.ID AS secure_id,s.username,u.Username AS local_username,
      u.Firstname AS first_name,u.Lastname AS last_name,u.Email AS email,s.is_active,s.is_admin,s.is_super_admin,m.secure_matches,
      CASE WHEN (u.center_id IS NOT NULL AND u.center_id<>@centerId)
        OR EXISTS(SELECT 1 FROM ${db}.dbo.secCareCenterUser other WHERE other.UserID=u.ID AND (other.center_id<>@centerId OR other.center_id IS NULL))
        OR EXISTS(SELECT 1 FROM icare_secure.dbo.Center_Users other WHERE other.center_user_id=u.ID
          AND (other.center_type IN(${sameDatabaseTypes}) OR other.center_type IS NULL OR other.center_type NOT IN(1,3,4))
          AND (other.center_id<>@centerId OR other.center_type<>@centerType OR other.center_id IS NULL OR other.center_type IS NULL)) THEN 1 ELSE 0 END AS shared_local,
      (SELECT COUNT(*) FROM icare_secure.dbo.Center_Users duplicate WHERE duplicate.username=s.username) AS duplicate_names
    FROM ${db}.dbo.sec_users u ${lock}
    OUTER APPLY(SELECT COUNT(*) AS secure_matches,MIN(ID) AS secure_id FROM icare_secure.dbo.Center_Users secure_user ${lock}
      WHERE secure_user.center_user_id=u.ID AND secure_user.center_id=@centerId AND secure_user.center_type=@centerType) m
    LEFT JOIN icare_secure.dbo.Center_Users s ${lock} ON s.ID=m.secure_id AND m.secure_matches=1
    WHERE ${member} AND ${scope}
    UNION ALL
    SELECT TOP(5001) 's_'+CONVERT(varchar(12),s.ID),NULL,s.ID,s.username,NULL,NULL,NULL,NULL,s.is_active,s.is_admin,s.is_super_admin,1,0,
      (SELECT COUNT(*) FROM icare_secure.dbo.Center_Users duplicate WHERE duplicate.username=s.username)
    FROM icare_secure.dbo.Center_Users s ${lock} WHERE s.center_id=@centerId AND s.center_type=@centerType AND ${scope}
      AND NOT EXISTS(SELECT 1 FROM ${db}.dbo.sec_users u WHERE u.ID=s.center_user_id AND ${member});
    SELECT TOP(25001) ur.UserID,ur.RoleID,
      CASE WHEN r.center_id IS NULL OR r.center_id=@centerId THEN r.Name ELSE N'Role outside this center' END AS role_name
    FROM ${db}.dbo.Sec_UserRoles ur LEFT JOIN ${db}.dbo.Sec_Roles r ON r.ID=ur.RoleID
    WHERE ${scope} AND EXISTS(SELECT 1 FROM ${db}.dbo.sec_users u WHERE u.ID=ur.UserID AND ${member})
    ORDER BY ur.UserID,ur.RoleID;`);
  const sets = result.recordsets as unknown as Row[][];
  if (!sets[0][0].allowed) throw new AccessDeniedError();
  if (sets[1].length > SQL_USER_LIMIT || sets[2].length > 25000)
    throw new PortalError(
      503,
      'CENTER_USER_LIMIT',
      'This center needs a larger account-directory query. Contact your administrator.',
    );
  return sets[1].map((row) => mapSql(row, sets[2], Boolean(sets[0][0].actor_admin)));
}
function previewRoster(actor: PortalActor, ref: CenterRef) {
  const store = getStore();
  seedCenterUsers(store);
  const admin = Boolean(demoDealer(actor.dealerId)?.isSuperAdmin);
  return previewUserRows(store, ref).map((row) => mapPreview(row, admin));
}
function selectUser(rows: CenterUser[], key: string) {
  const row = rows.find((r) => r.key === key);
  if (!row) throw new PortalError(404, 'CENTER_USER_NOT_FOUND', 'Center user not found.');
  return row;
}
function checkPolicy(current: CenterUser, next: CenterUserUpdate, rows: CenterUser[]) {
  if (current.issues.includes('protected_account')) throw new AccessDeniedError();
  const admins = rows.filter(
    (r) => r.active === true && (r.isAdmin || r.isSuperAdmin) && r.mapping === 'linked',
  ).length;
  try {
    assertCenterUserUpdate(current, next, admins);
  } catch (e) {
    if (!(e instanceof CenterUserPolicyError)) throw e;
    const messages = {
      MAPPING_REVIEW: 'Review this account’s center mapping before editing.',
      STATUS_UNAVAILABLE: 'Choose a supported secure sign-in status.',
      LAST_CENTER_ADMIN: 'Keep at least one enabled, linked center administrator.',
    };
    throw new PortalError(409, e.code, messages[e.code]);
  }
}
export async function centerUserOptions(actor: PortalActor, query: { q: string; page: number }) {
  if (actor.mode === 'preview') actor = currentPreviewActor(actor);
  const result = await listCenters(
    actor,
    directoryQuerySchema.parse({ q: query.q, page: query.page }),
  );
  return {
    ...result,
    items: result.items
      .filter((c) => hasPermission(actor, 'users.manage', c))
      .map((c) => ({ id: c.id, type: c.type, name: c.profile.name, domain: c.domain })),
  };
}
export async function legacyUserMappingIssues(actor: PortalActor): Promise<number | null> {
  if (actor.mode === 'preview') return demoDealer(actor.dealerId)?.isSuperAdmin ? 0 : null;
  if (!actor.isSuperAdmin) return null;
  const result = await (await getPool('secure')).request().input('actor', sql.Int, actor.dealerId)
    .query(`
    SELECT COUNT(*) AS issues FROM dbo.Center_Users u WHERE ${adminScope} AND
      (u.center_id IS NULL OR u.center_type IS NULL OR u.center_type NOT IN(1,3,4)
       OR (u.center_type IN(1,3) AND NOT EXISTS(SELECT 1 FROM icare.dbo.Care_Center c WHERE c.center_id=u.center_id AND c.type=u.center_type))
       OR (u.center_type=4 AND NOT EXISTS(SELECT 1 FROM icare_school.dbo.Care_Center c WHERE c.center_id=u.center_id AND c.type=4)));`);
  return Number(result.recordset[0].issues);
}
export async function listCenterUsers(
  actor: PortalActor,
  query: CenterUserQuery,
): Promise<CenterUserDirectory> {
  const ref = { id: query.centerId, type: query.centerType },
    center = await authorizedCenter(actor, ref),
    pageSize = 12;
  const rows = actor.mode === 'preview' ? previewRoster(actor, ref) : await sqlRoster(actor, ref);
  const filter = query.q.toLowerCase();
  const matched = rows
    .filter(
      (row) =>
        (!filter ||
          `${row.username} ${row.localUsername} ${row.firstName} ${row.lastName} ${row.email}`
            .toLowerCase()
            .includes(filter)) &&
        (query.status === 'all' ||
          (query.status === 'unknown'
            ? row.active === null
            : row.active === (query.status === 'enabled'))) &&
        (query.role === 'all' ||
          (query.role === 'review'
            ? row.mapping === 'review'
            : query.role === 'admin'
              ? row.isAdmin || row.isSuperAdmin
              : row.isAdmin === false && !row.isSuperAdmin)),
    )
    .sort(
      (a, b) =>
        (`${a.firstName} ${a.lastName}`.trim() || a.username || a.localUsername).localeCompare(
          `${b.firstName} ${b.lastName}`.trim() || b.username || b.localUsername,
        ) || a.key.localeCompare(b.key),
    );
  return {
    center: { ...ref, name: center.profile.name },
    items: matched.slice((query.page - 1) * pageSize, query.page * pageSize),
    total: matched.length,
    page: query.page,
    pageSize,
    enabledCount: matched.filter((r) => r.active === true).length,
    adminCount: matched.filter((r) => r.active === true && (r.isAdmin || r.isSuperAdmin)).length,
    reviewCount: matched.filter((r) => r.mapping === 'review').length,
  };
}
export async function getCenterUser(actor: PortalActor, ref: CenterRef, key: string) {
  await authorizedCenter(actor, ref);
  return selectUser(
    actor.mode === 'preview' ? previewRoster(actor, ref) : await sqlRoster(actor, ref),
    key,
  );
}
// Caller owns the SERIALIZABLE transaction. Used by runtime and rollback checks.
export async function updateCenterUserInTransaction(
  transaction: sql.Transaction,
  actor: PortalActor,
  ref: CenterRef,
  key: string,
  data: CenterUserUpdate,
) {
  assertPermission(actor, 'users.manage', ref);
  if (actor.mode !== 'legacy') throw new AccessDeniedError();
  await baseRequest(transaction, actor, ref)
    .query(`SELECT ID FROM icare_secure.dbo.Center_Users WITH(UPDLOCK,HOLDLOCK)
    WHERE center_id=@centerId AND center_type=@centerType AND (is_admin=1 OR is_super_admin=1) AND ${scope} ORDER BY ID;`);
  const rows = await sqlRoster(actor, ref, transaction),
    current = selectUser(rows, key);
  if (current.revision !== data.revision)
    throw new PortalError(
      409,
      'REVISION_CONFLICT',
      'This user changed. Reload the latest account before saving.',
    );
  checkPolicy(current, data, rows);
  const db = catalog(ref),
    request = baseRequest(transaction, actor, ref)
      .input('localId', sql.Int, current.localId)
      .input('firstName', sql.NVarChar(50), data.firstName || null)
      .input('lastName', sql.NVarChar(50), data.lastName || null)
      .input('email', sql.NVarChar(50), data.email || null)
      .input('changeFirst', sql.Bit, data.firstName !== current.firstName)
      .input('changeLast', sql.Bit, data.lastName !== current.lastName)
      .input('changeEmail', sql.Bit, data.email !== current.email);
  const updated =
    await request.query(`UPDATE u SET Firstname=CASE WHEN @changeFirst=1 THEN @firstName ELSE u.Firstname END,
      Lastname=CASE WHEN @changeLast=1 THEN @lastName ELSE u.Lastname END,
      Email=CASE WHEN @changeEmail=1 THEN @email ELSE u.Email END
    FROM ${db}.dbo.sec_users u WHERE u.ID=@localId AND ${membership(db)} AND ${scope};SELECT @@ROWCOUNT AS changed_count;`);
  if (Number(updated.recordset[0].changed_count) !== 1)
    throw new PortalError(
      409,
      'ACCOUNT_CHANGED',
      'The local account could not be updated. Reload it.',
    );
  if (data.active !== current.active) {
    const status = await baseRequest(transaction, actor, ref)
      .input('secureId', sql.Int, current.secureId)
      .input('localId', sql.Int, current.localId)
      .input('active', sql.Bit, data.active)
      .query(`UPDATE icare_secure.dbo.Center_Users SET is_active=@active WHERE ID=@secureId AND center_user_id=@localId
        AND center_id=@centerId AND center_type=@centerType AND ${scope};SELECT @@ROWCOUNT AS changed_count;`);
    if (Number(status.recordset[0].changed_count) !== 1)
      throw new PortalError(
        409,
        'ACCOUNT_CHANGED',
        'The secure account could not be updated. Reload it.',
      );
  }
  return selectUser(await sqlRoster(actor, ref, transaction), key);
}
function finishReceipt(store: PortalStore, id: string, state: string) {
  try {
    store.db
      .prepare('UPDATE center_user_operations SET state=?,completed_at=? WHERE id=?')
      .run(state, Date.now(), id);
  } catch {
    console.error('Center user operation needs reconciliation', { operationId: id });
  }
}
export async function updateCenterUser(
  actor: PortalActor,
  ref: CenterRef,
  key: string,
  data: CenterUserUpdate,
) {
  await authorizedCenter(actor, ref);
  if (actor.mode === 'preview') {
    const store = getStore();
    seedCenterUsers(store);
    const actual = demoDealer(actor.dealerId);
    if (!actual) throw new AccessDeniedError();
    return store.transaction(() => {
      const rows = previewUserRows(store, ref).map((row) => mapPreview(row, actual.isSuperAdmin)),
        current = selectUser(rows, key);
      if (current.revision !== data.revision)
        throw new PortalError(
          409,
          'REVISION_CONFLICT',
          'This user changed. Reload the latest account before saving.',
        );
      checkPolicy(current, data, rows);
      store.db
        .prepare(
          'UPDATE preview_center_users SET first_name=?,last_name=?,email=?,active=? WHERE local_id=? AND center_id=? AND center_type=?',
        )
        .run(
          data.firstName,
          data.lastName,
          data.email,
          data.active === null ? null : Number(data.active),
          current.localId,
          ref.id,
          ref.type,
        );
      return selectUser(
        previewUserRows(store, ref).map((row) => mapPreview(row, actual.isSuperAdmin)),
        key,
      );
    });
  }
  if (!centerUserWritesEnabled())
    throw new PortalError(
      503,
      'CENTER_USER_WRITES_DISABLED',
      'Center user changes are not enabled in this environment.',
    );
  const store = getStore(),
    id = randomUUID();
  store.db
    .prepare('INSERT INTO center_user_operations VALUES (?,?,?,?,?,?,?,?,?,NULL)')
    .run(id, actor.mode, actor.dealerId, ref.id, ref.type, key, 'updated', 'pending', Date.now());
  const transaction = new sql.Transaction(await getPool('secure'));
  let committing = false;
  try {
    await transaction.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    const saved = await updateCenterUserInTransaction(transaction, actor, ref, key, data);
    committing = true;
    await transaction.commit();
    finishReceipt(store, id, 'committed');
    return saved;
  } catch (e) {
    await transaction.rollback().catch(() => {});
    finishReceipt(store, id, committing ? 'unconfirmed' : 'failed');
    throw e;
  }
}
