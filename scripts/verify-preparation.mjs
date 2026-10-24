import { readFile, readdir } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { createHash } from 'node:crypto';

if (!process.argv[2])
  throw new Error('Pass the legacy source directory. No databases will be contacted.');
const legacy = resolve(process.argv[2]);
const root = resolve('.');
const inventory = JSON.parse(await readFile('docs/generated/legacy-inventory.json', 'utf8'));
for (const file of inventory.files) {
  const hash = createHash('sha256')
    .update(await readFile(join(legacy, file.path), 'utf8'))
    .digest('hex');
  if (hash !== file.sha256) throw new Error(`Source fingerprint changed: ${file.path}`);
}
const sensitive = new Set();
for (const name of await readdir(join(legacy, 'Configurations'))) {
  if (!name.endsWith('.config')) continue;
  const content = await readFile(join(legacy, 'Configurations', name), 'utf8');
  for (const item of content.matchAll(/(?:password|pwd)\s*=\s*([^;"\r\n]+)/gi))
    if (item[1].trim().length >= 6) sensitive.add(item[1].trim());
}
for (const name of await readdir(legacy)) {
  if (!name.endsWith('.aspx')) continue;
  const content = await readFile(join(legacy, name), 'utf8');
  for (const item of content.matchAll(/[?&]key=([^"&\s<>]+)/g))
    if (item[1].length >= 10) sensitive.add(item[1]);
}
const excluded = new Set([
  'node_modules',
  '.next',
  '.next-e2e',
  '.local',
  '.git',
  'test-results',
  'playwright-report',
]);
let count = 0;
async function scan(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    if (excluded.has(entry.name)) continue;
    const file = join(dir, entry.name);
    if (entry.isDirectory()) {
      await scan(file);
      continue;
    }
    if (!/\.(md|json|ts|tsx|mjs|css|ps1|sql)$|\.env\.example$/.test(entry.name)) continue;
    const content = await readFile(file, 'utf8');
    count++;
    for (const value of sensitive)
      if (content.includes(value))
        throw new Error(
          `Legacy secret material detected in ${relative(root, file)}; value withheld`,
        );
  }
}
await scan(root);
console.log(
  `Verified ${inventory.files.length} legacy source fingerprints and scanned ${count} preparation files for copied legacy SQL passwords / Maps keys. No matches. Short secrets below six characters are outside this comparison; this is not a full secret scanner.`,
);
