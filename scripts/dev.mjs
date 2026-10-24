import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
// Keep mutable runtime storage paths out of Next's source graph and deployment traces.
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'dev', '--hostname', '127.0.0.1', ...process.argv.slice(2)],
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
