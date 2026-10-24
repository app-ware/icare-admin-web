import 'server-only';
import { readFileSync } from 'node:fs';
import type sql from 'mssql';
import { developmentSqlCompatibilityEnabled } from '@/server/runtime';

export function readSqlConfiguration(envKey: string, env = process.env): sql.config {
  // File paths come only from private server configuration, never from requests.
  // An environment path avoids copying secrets into dotenv expansion or build output.
  let raw = env[envKey];
  if (!raw && developmentSqlCompatibilityEnabled(env)) {
    const path = env[`${envKey}_FILE`];
    if (path) raw = readFileSync(path, 'utf8').replace(/^\uFEFF/, '');
  }
  if (!raw) throw new Error('Database connection is not configured');
  try {
    return JSON.parse(raw) as sql.config;
  } catch {
    throw new Error('Invalid database configuration');
  }
}

export function validateSqlTransport(config: sql.config, env = process.env): boolean {
  const developmentCompatibility =
    developmentSqlCompatibilityEnabled(env) && config.server === env.ICARE_DEV_SQL_SERVER;
  // Encryption is required even for the confirmed development server. Only
  // certificate trust and its existing administrator identity get a local exception.
  if (
    config.options?.encrypt !== true ||
    (config.options.trustServerCertificate === true && !developmentCompatibility)
  )
    throw new Error('Validated SQL TLS is required');
  return developmentCompatibility;
}
