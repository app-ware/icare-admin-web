import 'server-only';
import sql from 'mssql';
import { liveDataEnabled } from '@/server/runtime';
import { PortalError } from '@/server/http';
import { readSqlConfiguration, validateSqlTransport } from './configuration';

export type DatabaseRole = 'secure' | 'nursery' | 'school' | 'accounting' | 'logging';
const envKeys: Record<DatabaseRole, string> = {
  secure: 'ICARE_SQL_SECURE',
  nursery: 'ICARE_SQL_NURSERY',
  school: 'ICARE_SQL_SCHOOL',
  accounting: 'ICARE_SQL_ACCOUNTING',
  logging: 'ICARE_SQL_LOGGING',
};
const runtime = globalThis as typeof globalThis & {
  icarePools?: Map<DatabaseRole, Promise<sql.ConnectionPool>>;
};
const pools = (runtime.icarePools ??= new Map());

export async function getPool(role: DatabaseRole): Promise<sql.ConnectionPool> {
  if (role === 'accounting' || role === 'logging')
    throw new PortalError(503, 'DATABASE_PENDING', 'This database is not available yet.');
  if (!liveDataEnabled()) throw new Error('Live database access is disabled');
  if (!Object.hasOwn(envKeys, role)) throw new Error('Unknown database role');
  const existing = pools.get(role);
  if (existing) return existing;
  const pending = (async () => {
    const config = readSqlConfiguration(envKeys[role]);
    if (!config.server || !config.database) throw new Error(`Incomplete configuration for ${role}`);
    const expectedCatalog = {
      secure: 'icare_secure',
      nursery: 'icare',
      school: 'icare_school',
      accounting: 'icare_accounting',
      logging: 'icare_log',
    }[role];
    if (config.database.toLowerCase() !== expectedCatalog)
      throw new Error('Database catalog does not match the audited role');
    const developmentCompatibility = validateSqlTransport(config);
    const pool = new sql.ConnectionPool({
      ...config,
      connectionTimeout: 10000,
      requestTimeout: 30000,
      pool: { min: 0, max: 5, idleTimeoutMillis: 30000 },
    });
    pool.on('error', () => console.error('SQL pool error', { role }));
    try {
      await pool.connect();
      const privileges = await pool
        .request()
        .query(
          "SELECT IS_SRVROLEMEMBER('sysadmin') AS is_admin, IS_MEMBER('db_owner') AS is_owner, HAS_PERMS_BY_NAME(DB_NAME(),'DATABASE','CONTROL') AS has_control",
        );
      const current = privileges.recordset[0];
      if (
        !developmentCompatibility &&
        (current?.is_admin || current?.is_owner || current?.has_control)
      ) {
        await pool.close();
        throw new PortalError(
          503,
          'SQL_PRIVILEGES_UNSAFE',
          'A restricted database account is required before live access can be enabled.',
        );
      }
      return pool;
    } catch (error) {
      await pool.close().catch(() => undefined);
      if (error instanceof PortalError) throw error;
      throw new Error(`Database role ${role} is unavailable`);
    }
  })();
  pools.set(role, pending);
  try {
    return await pending;
  } catch (error) {
    if (pools.get(role) === pending) pools.delete(role);
    throw error;
  }
}
export async function closePools(): Promise<void> {
  const pending = [...pools.values()];
  pools.clear();
  await Promise.allSettled(pending.map(async (p) => (await p).close()));
}
