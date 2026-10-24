import { resolve } from 'node:path';
import { unlinkSync } from 'node:fs';

// Reset only the dedicated fictional browser-test store, before Next starts.
// Preserve the user's normal portal store and all live databases.
const file = resolve(process.env.ICARE_STORAGE_PATH || '');
if (file !== resolve('.local/e2e-portal.sqlite') || process.env.ICARE_LIVE_DATA_ENABLED !== 'false')
  throw new Error('Browser tests require their dedicated store and disabled live SQL.');
for (const suffix of ['', '-wal', '-shm']) {
  try {
    unlinkSync(file + suffix);
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
  }
}
await import('./dev.mjs');
