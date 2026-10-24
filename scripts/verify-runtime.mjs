import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
const origin = 'http://127.0.0.1:3102';
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '--hostname', '127.0.0.1', '--port', '3102'],
  {
    env: {
      ...process.env,
      ICARE_PREVIEW_ENABLED: 'false',
      ICARE_LIVE_DATA_ENABLED: 'false',
      ICARE_APP_ORIGIN: origin,
      ICARE_STORAGE_PATH: '.local/production-smoke.sqlite',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  },
);
// Drain without printing server logs, which could contain operational details.
server.stdout.on('data', () => {});
server.stderr.on('data', () => {});
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error('Server exited before readiness');
    try {
      if ((await fetch(origin + '/api/health', { signal: AbortSignal.timeout(1000) })).ok) {
        ready = true;
        break;
      }
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  assert.ok(ready);
  for (const route of [
    '/',
    '/centers',
    '/dealers',
    '/users',
    '/activity',
    '/reports',
    '/access',
    '/payments',
  ]) {
    const response = await fetch(origin + route, { redirect: 'manual' });
    assert.equal(response.status, 307);
    assert.ok(response.headers.get('location').endsWith('/login'));
    assert.ok(!(await response.text()).includes('Little Cedar Nursery'));
  }
  const login = await (await fetch(origin + '/login')).text();
  assert.ok(login.includes('Welcome back'));
  assert.ok(!login.includes('Explore demo workspace'));
  for (const route of [
    '/api/centers',
    '/api/live/centers',
    '/api/auth/sessions',
    '/api/dealers',
    '/api/dealers/centers',
    '/api/dealers/1',
    '/api/center-users?centerId=9999&centerType=1',
    '/api/center-users/centers',
    '/api/center-users/1/9999/l_1',
    '/api/activity?centerId=9999&centerType=1&period=2024-03',
    '/api/activity/centers',
    '/api/activity/context',
    '/api/reports/exports',
  ]) {
    const response = await fetch(origin + route);
    assert.equal(response.status, 401);
    assert.match(response.headers.get('cache-control'), /no-store/);
  }
  const preview = await fetch(origin + '/api/auth/preview', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({ role: 'admin' }),
  });
  assert.equal(preview.status, 404);
  console.log(
    'Production smoke passed: protected pages redirect, APIs deny anonymous access, demo disabled, no sample records in protected responses.',
  );
} catch (error) {
  console.error('Production smoke failed:', error.message);
  process.exitCode = 1;
} finally {
  if (server.exitCode === null) {
    const exited = once(server, 'exit');
    server.kill();
    await exited;
  }
}
