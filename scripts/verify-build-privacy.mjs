import { readdir, readFile } from 'node:fs/promises';
import { resolve, join, dirname, basename, sep } from 'node:path';
import assert from 'node:assert/strict';
const privatePath = (file) =>
  file.includes(`${sep}.local${sep}`) ||
  basename(file).startsWith('.env') ||
  /ConnectionStrings.*\.config$/i.test(file) ||
  /\.sqlite(?:-wal|-shm)?$/i.test(file);
async function files(dir) {
  const result = [];
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const file = join(dir, entry.name);
    // Do not traverse dependency junctions/symlinks outside the build.
    if (entry.isDirectory()) result.push(...(await files(file)));
    else if (entry.isFile()) result.push(file);
  }
  return result;
}
let traces = 0;
for (const file of await files('.next')) {
  if (
    !file.endsWith('.nft.json') ||
    file.includes(`${sep}standalone${sep}`) ||
    file.includes(`${sep}dev${sep}`)
  )
    continue;
  traces++;
  const trace = JSON.parse(await readFile(file, 'utf8'));
  assert.ok(
    !(trace.files ?? []).some((item) => privatePath(resolve(dirname(file), item))),
    'Build traces must exclude private storage and configuration.',
  );
}
assert.ok(traces > 0, 'Build before running this check.');
assert.ok(
  !(await files('.next/standalone')).some(privatePath),
  'Standalone output must exclude private data/configuration.',
);
console.log(
  `Build privacy passed: ${traces} traces and standalone files contain no private store, SQLite data, env files or legacy connection configurations.`,
);
