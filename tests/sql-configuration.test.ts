import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readSqlConfiguration, validateSqlTransport } from '../src/server/db/configuration';
import { developmentSqlCompatibilityEnabled } from '../src/server/runtime';
import { mkdtempSync, writeFileSync, rmSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

test('development SQL exception requires an explicit switch, loopback origin, development runtime and exact server', () => {
  const env = {
    NODE_ENV: 'development',
    ICARE_DEV_SQL_COMPATIBILITY: 'true',
    ICARE_DEV_SQL_SERVER: 'dev.example',
    ICARE_APP_ORIGIN: 'http://127.0.0.1:3000',
  } as NodeJS.ProcessEnv;
  const config = {
    server: 'dev.example',
    options: { encrypt: true, trustServerCertificate: true },
  };
  assert.equal(validateSqlTransport(config, env), true);
  const overrides: Partial<NodeJS.ProcessEnv>[] = [
    { NODE_ENV: 'production' },
    { NODE_ENV: 'test' },
    { ICARE_DEV_SQL_COMPATIBILITY: 'false' },
    { ICARE_APP_ORIGIN: 'https://portal.example' },
    { ICARE_APP_ORIGIN: '' },
    { ICARE_APP_ORIGIN: 'http://127.0.0.1.evil.example' },
    { ICARE_DEV_SQL_SERVER: 'other.example' },
  ];
  for (const override of overrides)
    assert.throws(() => validateSqlTransport(config, { ...env, ...override }));
  assert.equal(
    developmentSqlCompatibilityEnabled({ ...env, ICARE_APP_ORIGIN: 'file://localhost/path' }),
    false,
  );
  assert.throws(() => validateSqlTransport({ ...config, options: { encrypt: false } }, env));
  assert.equal(
    validateSqlTransport(
      { ...config, options: { encrypt: true, trustServerCertificate: false } },
      { ...env, NODE_ENV: 'production' },
    ),
    false,
  );
});

test('private development SQL files cannot configure production, and runtime JSON takes precedence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'icare-sql-configuration-'));
  const path = join(directory, 'connection.json');
  writeFileSync(path, JSON.stringify({ server: 'dev.example', password: '$literal-value' }));
  const env = {
    NODE_ENV: 'development',
    ICARE_DEV_SQL_COMPATIBILITY: 'true',
    ICARE_DEV_SQL_SERVER: 'dev.example',
    ICARE_APP_ORIGIN: 'http://127.0.0.1:3000',
    ICARE_SQL_SECURE_FILE: path,
  } as NodeJS.ProcessEnv;
  try {
    assert.equal(readSqlConfiguration('ICARE_SQL_SECURE', env).password, '$literal-value');
    assert.throws(() =>
      readSqlConfiguration('ICARE_SQL_SECURE', { ...env, NODE_ENV: 'production' }),
    );
    assert.throws(() =>
      readSqlConfiguration('ICARE_SQL_SECURE', { ...env, ICARE_DEV_SQL_COMPATIBILITY: 'false' }),
    );
    assert.equal(
      readSqlConfiguration('ICARE_SQL_SECURE', {
        ...env,
        NODE_ENV: 'production',
        ICARE_SQL_SECURE: JSON.stringify({ server: 'production.example' }),
      }).server,
      'production.example',
    );
  } finally {
    rmSync(path);
    rmdirSync(directory);
  }
});
