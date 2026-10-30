import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
// Keep mutable runtime storage paths out of Next's source graph and deployment traces.
const args = process.argv.slice(2);
// The installed Turbopack dev preview repeatedly refreshes in this workspace.
// Webpack is stable; explicit bundler flags remain available for investigation.
const bundler = args.some((value) => ['--webpack', '--turbopack', '--turbo'].includes(value))
  ? []
  : ['--webpack'];
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', ...bundler, '--hostname', '127.0.0.1', ...args],
  {
    env: {
      ...process.env,
      ICARE_STORAGE_PATH: process.env.ICARE_STORAGE_PATH || resolve('.local/portal.sqlite'),
    },
    stdio: 'inherit',
    windowsHide: true,
  },
);
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
child.on('error', () => {
  console.error('Unable to start the local portal.');
  process.exitCode = 1;
});
child.on('exit', (code) => {
  process.exitCode = code ?? 0;
});
