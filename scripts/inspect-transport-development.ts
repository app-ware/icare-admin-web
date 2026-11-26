// Explicit read-only development inspection. Never imported by application runtime.
import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { loadEnvConfig } from '@next/env';
import type sql from 'mssql';
import { referencesValid, type BusReferences } from '../src/domain/transport';

let stage = 'development guards';
async function main() {
  assert.equal(process.env.NODE_ENV, 'development');
  const args = process.argv.slice(2);
  assert.equal(args.length, 2);
  assert.ok(args.includes('--development-only') && args.includes('--read-only'));
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const { developmentSqlCompatibilityEnabled } = await import('../src/server/runtime');
  const { readSqlConfiguration, validateSqlTransport } =
    await import('../src/server/db/configuration');
  assert.ok(developmentSqlCompatibilityEnabled());
  assert.ok(validateSqlTransport(readSqlConfiguration('ICARE_SQL_SECURE')));
  assert.equal(process.env.ICARE_LIVE_DATA_ENABLED, 'true');
  const { getPool, closePools } = await import('../src/server/db/pools');
  try {
    stage = 'reference reads';
    const pool = await getPool('secure'),
      catalogs = [];
    // Catalog names are fixed audited constants; arguments cannot choose SQL or databases.
    for (const database of ['icare', 'icare_school']) {
      const result = await pool.request().query(`
        SELECT (SELECT COUNT(*) FROM ${database}.dbo.GeofenceRaduis_Values) radiusChoices,
          (SELECT COUNT(*) FROM ${database}.dbo.DwellDuration_Values) dwellChoices,
          (SELECT COUNT(*) FROM ${database}.dbo.Input_Type) inputChoices,
          (SELECT COUNT(*) FROM ${database}.dbo.Input_Type WHERE is_enabled=1) enabledInputChoices,
          (SELECT COUNT(*) FROM ${database}.dbo.Bus_Settings WHERE bus_id=-1) catalogDefaults,
          (SELECT COUNT(*) FROM ${database}.dbo.Bus_Settings WHERE bus_id<>-1) overrides,
          (SELECT COUNT(*) FROM ${database}.dbo.Bus_Type) registeredBuses;
        SELECT TOP(101) geofence_raduis_id id,raduis_value value,raduis_text label FROM ${database}.dbo.GeofenceRaduis_Values ORDER BY geofence_raduis_id;
        SELECT TOP(101) dwell_duration_id id,duration_value value,duration_text label FROM ${database}.dbo.DwellDuration_Values ORDER BY dwell_duration_id;
        SELECT TOP(101) input_type_id id,input_type_desc label FROM ${database}.dbo.Input_Type WHERE is_enabled=1 ORDER BY input_type_id;
      `);
      const rows = result.recordsets as unknown as sql.IRecordSet<Record<string, unknown>>[];
      const counts = Object.fromEntries(
        Object.entries(rows[0][0]).map(([key, value]) => [key, Number(value)]),
      );
      const refs: BusReferences = {
        radius: rows[1].map((r) => ({
          id: Number(r.id),
          label: String(r.label ?? ''),
          value: r.value == null ? null : Number(r.value),
        })),
        dwell: rows[2].map((r) => ({
          id: Number(r.id),
          label: String(r.label ?? ''),
          value: r.value == null ? null : Number(r.value),
        })),
        input: rows[3].map((r) => ({
          id: Number(r.id),
          label: String(r.label ?? ''),
          value: null,
        })),
      };
      catalogs.push({
        role: database === 'icare' ? 'Nursery/Lite' : 'School',
        counts,
        referenceChoicesValid: referencesValid(refs),
        missingChoices: Object.entries(refs)
          .filter(([, choices]) => choices.length === 0)
          .map(([key]) => key),
      });
    }
    const report = {
      checkedAt: new Date().toISOString(),
      developmentOnly: true,
      readOnly: true,
      configuredWriteSwitch: process.env.ICARE_TRANSPORT_WRITES_ENABLED === 'true',
      catalogs,
      remainingAcceptance: [
        'Business-reviewed reference IDs, values, labels and units; input consumer meanings',
        'Reviewed application of approved references without automatic repair or global-default writes',
        'Committed disposable-fixture/public-boundary acceptance and cleanup before enabling dev writes',
      ],
      limitations:
        'Counts/reference checks are observations, not a write-enablement decision, consistent cross-catalog snapshot, production privilege acceptance or client delivery confirmation.',
    };
    stage = 'redacted report writing';
    await writeFile(
      'docs/generated/transport-dev-readiness.json',
      JSON.stringify(report, null, 2) + '\n',
    );
    console.log(JSON.stringify(report));
  } finally {
    await closePools();
  }
}
main().catch(() => {
  // Never print provider errors, connection config or reference values.
  console.error('Transport development inspection did not complete', { stage });
  process.exitCode = 1;
});
