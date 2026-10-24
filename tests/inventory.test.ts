import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { modules } from '../src/features/registry';

test('every legacy screen has exactly one migration owner', () => {
  const inventory = JSON.parse(
    readFileSync(new URL('../docs/generated/legacy-inventory.json', import.meta.url), 'utf8'),
  );
  const mapped = ['Index.aspx', ...modules.flatMap((module) => [...module.legacyPages])];
  assert.equal(mapped.length, new Set(mapped).size, 'duplicate page ownership');
  assert.deepEqual(
    mapped.sort(),
    inventory.pages.map((page: { path: string }) => page.path).sort(),
  );
  for (const page of inventory.pages)
    assert.ok(page.handlers.length > 0, `missing handlers for ${page.path}`);
});
