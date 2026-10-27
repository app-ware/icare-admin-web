// Server-owner maintenance only. Dry run by default; never imported by requests.
import { stat } from 'node:fs/promises';
import { resolve } from 'node:path';
async function main() {
  const file = process.env.ICARE_STORAGE_PATH;
  if (!file || file === ':memory:')
    throw new Error('Set an existing private storage file explicitly.');
  await stat(resolve(file));
  const { getStore } = await import('../src/server/store');
  const store = getStore();
  try {
    const result = store.transaction(() => {
      const predicate =
        "state<>'published' AND expires_at<=? AND NOT EXISTS(SELECT 1 FROM branding_slots s WHERE s.asset_id=branding_assets.id)";
      const now = Date.now(),
        rows = store.db
          .prepare(
            `SELECT COUNT(*) AS images,COALESCE(SUM(bytes),0) AS bytes FROM branding_assets WHERE ${predicate}`,
          )
          .get(now)!;
      const apply = process.argv.includes('--apply');
      if (apply) store.db.prepare(`DELETE FROM branding_assets WHERE ${predicate}`).run(now);
      return {
        dryRun: !apply,
        expiredImages: Number(rows.images),
        normalizedBytes: Number(rows.bytes),
        currentImagesPreserved: true,
      };
    });
    console.log(JSON.stringify(result));
  } finally {
    store.close();
  }
}
main().catch(() => {
  console.error(
    'Branding maintenance could not complete. Check the explicit private store path and available storage.',
  );
  process.exitCode = 1;
});
