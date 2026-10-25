// Separate, explicit dev acceptance. Every fixture and temporary reference rolls back.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { loadEnvConfig } from '@next/env';
import sql from 'mssql';
import { centerGrants, type PortalActor } from '../src/domain/access';
import { centerKey, type CenterRef } from '../src/domain/centers';
let stage = 'development guards';
async function main() {
  assert.equal(process.env.NODE_ENV, 'development');
  assert.ok(process.argv.includes('--development-only'));
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const { developmentSqlCompatibilityEnabled } = await import('../src/server/runtime');
  const { readSqlConfiguration, validateSqlTransport } =
    await import('../src/server/db/configuration');
  assert.ok(developmentSqlCompatibilityEnabled());
  assert.ok(validateSqlTransport(readSqlConfiguration('ICARE_SQL_SECURE')));
  assert.equal(process.env.ICARE_LIVE_DATA_ENABLED, 'true');
  process.env.ICARE_STORAGE_PATH = resolve(`.local/transport-acceptance-${randomUUID()}.sqlite`);
  const { getPool, closePools } = await import('../src/server/db/pools');
  const { getBusInTransaction, updateBusInTransaction } =
    await import('../src/server/transport/repository');
  const pool = await getPool('secure'),
    tx = new sql.Transaction(pool),
    checks: string[] = [];
  stage = 'baseline';
  const snapshot = async () => {
    const hashes: string[] = [];
    for (const db of ['icare', 'icare_school']) {
      const r = await pool.request().query(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',CONCAT(
    (SELECT bus_type_id,center_id,bus_name FROM ${db}.dbo.Bus_Type ORDER BY bus_type_id FOR JSON PATH,INCLUDE_NULL_VALUES),
    (SELECT bus_settings_id,bus_id,geofence_raduis,dwell_duration,passenger_input_type FROM ${db}.dbo.Bus_Settings ORDER BY bus_settings_id FOR JSON PATH,INCLUDE_NULL_VALUES),
    (SELECT dwell_duration_id,duration_value,duration_text FROM ${db}.dbo.DwellDuration_Values ORDER BY dwell_duration_id FOR JSON PATH,INCLUDE_NULL_VALUES),
    (SELECT geofence_raduis_id,raduis_value,raduis_text FROM ${db}.dbo.GeofenceRaduis_Values ORDER BY geofence_raduis_id FOR JSON PATH,INCLUDE_NULL_VALUES),
    (SELECT input_type_id,input_type_desc,is_enabled FROM ${db}.dbo.Input_Type ORDER BY input_type_id FOR JSON PATH,INCLUDE_NULL_VALUES))),2) AS fingerprint;`);
      hashes.push(r.recordset[0].fingerprint);
    }
    return hashes;
  };
  try {
    const before = await snapshot();
    // Refuse to run temporary reference fixtures against a populated catalog. Never repair seeds.
    for (const db of ['icare', 'icare_school']) {
      const r = await pool.request()
        .query(`SELECT (SELECT COUNT(*) FROM ${db}.dbo.DwellDuration_Values)+(SELECT COUNT(*) FROM ${db}.dbo.GeofenceRaduis_Values)+(SELECT COUNT(*) FROM ${db}.dbo.Input_Type)+(SELECT COUNT(*) FROM ${db}.dbo.Bus_Settings) AS n;
   SELECT t.name FROM ${db}.sys.triggers t JOIN ${db}.sys.objects o ON o.object_id=t.parent_id WHERE o.name IN('Bus_Type','Bus_Settings','Input_Type','DwellDuration_Values','GeofenceRaduis_Values') AND t.is_disabled=0;`);
      assert.equal(
        r.recordset[0].n,
        0,
        'Use an isolated acceptance catalog once real references/settings exist',
      );
      assert.equal((r.recordsets as sql.IRecordSet<unknown>[])[1].length, 0);
    }
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      stage = 'credentialless actor fixture';
      const marker = `Portal bus acceptance ${randomUUID()}`;
      const dealer = await new sql.Request(tx)
        .input('name', sql.NVarChar(450), marker)
        .input('user', sql.NVarChar(450), `bus.fixture.${randomUUID()}`)
        .query(
          'INSERT icare_secure.dbo.Dealers(dealer_name,username,is_super_admin,is_active) OUTPUT inserted.dealer_id AS id VALUES(@name,@user,0,1)',
        );
      const id = Number(dealer.recordset[0].id),
        refs: CenterRef[] = [],
        buses: number[] = [];
      for (const type of [1, 3, 4] as const) {
        stage = `type ${type} fixtures`;
        const db = type === 4 ? 'icare_school' : 'icare';
        const c = await new sql.Request(tx)
          .input('name', sql.NVarChar(sql.MAX), marker)
          .input('type', sql.Int, type)
          .query(
            `DECLARE @ids TABLE(id int); INSERT ${db}.dbo.Care_Center(center_name,type,is_demo) OUTPUT inserted.center_id INTO @ids VALUES(@name,@type,1); SELECT id FROM @ids;`,
          );
        const ref = { id: Number(c.recordset[0].id), type };
        refs.push(ref);
        await new sql.Request(tx)
          .input('actor', sql.Int, id)
          .input('center', sql.Int, ref.id)
          .input('type', sql.Int, type)
          .query(
            'INSERT icare_secure.dbo.Dealer_Centers(dealer_id,center_id,center_type) VALUES(@actor,@center,@type)',
          );
        const b = await new sql.Request(tx)
          .input('center', sql.Int, ref.id)
          .input('name', sql.NVarChar(sql.MAX), marker)
          .query(
            `INSERT ${db}.dbo.Bus_Type(center_id,bus_name) OUTPUT inserted.bus_type_id AS id VALUES(@center,@name);`,
          );
        buses.push(Number(b.recordset[0].id));
      }
      const actor: PortalActor = {
        subject: `legacy:${id}`,
        dealerId: id,
        name: 'Acceptance',
        username: 'fixture',
        isSuperAdmin: false,
        sessionId: 'acceptance',
        mode: 'legacy',
        active: true,
        expiresAt: Date.now() + 60000,
        grants: centerGrants(false, refs.map(centerKey)),
      };
      for (let i = 0; i < refs.length; i++) {
        const d = await getBusInTransaction(actor, refs[i], buses[i], tx, true);
        assert.equal(d.source, 'missing');
        assert.equal(d.issues.length, 1);
        await assert.rejects(
          () =>
            updateBusInTransaction(
              actor,
              refs[i],
              buses[i],
              { action: 'override', revision: d.revision, radius: 1, dwell: 1, input: 1 },
              tx,
            ),
          { code: 'SETTINGS_REVIEW' },
        );
      }
      checks.push('Missing live references and defaults stay explicit and cannot be saved');
      for (const db of ['icare', 'icare_school']) {
        stage = `${db} temporary choices`;
        await new sql.Request(tx).query(
          `INSERT ${db}.dbo.DwellDuration_Values(duration_value,duration_text) VALUES(333,N'333 seconds (temporary acceptance)'); INSERT ${db}.dbo.GeofenceRaduis_Values(raduis_value,raduis_text) VALUES(777,N'777 metres (temporary acceptance)'); INSERT ${db}.dbo.Input_Type(input_type_id,input_type_desc,is_enabled) VALUES(777777,N'Acceptance input',1);`,
        );
      }
      for (let i = 0; i < refs.length; i++) {
        stage = `type ${refs[i].type} save and inheritance`;
        const ref = refs[i],
          bus = buses[i],
          db = ref.type === 4 ? 'icare_school' : 'icare';
        const initial = await getBusInTransaction(actor, ref, bus, tx, true);
        const radius = initial.references.radius[0].id,
          dwell = initial.references.dwell[0].id,
          input = 777777;
        assert.equal(initial.source, ref.type === 3 ? 'inherited' : 'missing');
        assert.equal(initial.issues.length, 0);
        await assert.rejects(
          () =>
            updateBusInTransaction(
              actor,
              ref,
              bus,
              { action: 'override', revision: initial.revision, radius: 2147483647, dwell, input },
              tx,
            ),
          { code: 'INVALID_CHOICE' },
        );
        const saved = await updateBusInTransaction(
          actor,
          ref,
          bus,
          { action: 'override', revision: initial.revision, radius, dwell, input },
          tx,
        );
        assert.equal(saved.source, 'override');
        assert.equal(saved.values?.radius, radius);
        assert.notEqual(radius, 777);
        await assert.rejects(
          () =>
            updateBusInTransaction(
              actor,
              ref,
              bus,
              { action: 'override', revision: initial.revision, radius, dwell, input },
              tx,
            ),
          { code: 'REVISION_CONFLICT' },
        );
        if (ref.type !== 3)
          await new sql.Request(tx)
            .input('radius', sql.Int, radius)
            .input('dwell', sql.Int, dwell)
            .query(
              `INSERT ${db}.dbo.Bus_Settings(bus_id,geofence_raduis,dwell_duration,passenger_input_type) VALUES(-1,@radius,@dwell,777777)`,
            );
        const refreshed = await getBusInTransaction(actor, ref, bus, tx, true);
        assert.equal(refreshed.canInherit, true);
        const inherited = await updateBusInTransaction(
          actor,
          ref,
          bus,
          { action: 'inherit', revision: refreshed.revision },
          tx,
        );
        assert.equal(inherited.source, 'inherited');
        await new sql.Request(tx)
          .input('bus', sql.Int, bus)
          .input('radius', sql.Int, radius)
          .input('dwell', sql.Int, dwell)
          .query(
            `INSERT ${db}.dbo.Bus_Settings(bus_id,geofence_raduis,dwell_duration,passenger_input_type) VALUES(@bus,@radius,@dwell,777777),(@bus,@radius,@dwell,777777)`,
          );
        const duplicate = await getBusInTransaction(actor, ref, bus, tx, true);
        assert.ok(duplicate.issues.length);
        await assert.rejects(
          () =>
            updateBusInTransaction(
              actor,
              ref,
              bus,
              { action: 'override', revision: duplicate.revision, radius, dwell, input },
              tx,
            ),
          { code: 'SETTINGS_REVIEW' },
        );
        checks.push(
          `Type ${ref.type}: lookup IDs, insert, readback, stale revision, default restoration and duplicate denial`,
        );
      }
      stage = 'current ownership boundary';
      await assert.rejects(() => getBusInTransaction(actor, refs[1], buses[0], tx, true), {
        code: 'BUS_NOT_FOUND',
      });
      await new sql.Request(tx)
        .input('actor', sql.Int, id)
        .query('UPDATE icare_secure.dbo.Dealers SET is_active=0 WHERE dealer_id=@actor');
      await assert.rejects(() => getBusInTransaction(actor, refs[0], buses[0], tx, true), {
        code: 'BUS_NOT_FOUND',
      });
      await new sql.Request(tx)
        .input('actor', sql.Int, id)
        .query('UPDATE icare_secure.dbo.Dealers SET is_active=1 WHERE dealer_id=@actor');
      await new sql.Request(tx)
        .input('actor', sql.Int, id)
        .query('DELETE icare_secure.dbo.Dealer_Centers WHERE dealer_id=@actor');
      await assert.rejects(() => getBusInTransaction(actor, refs[0], buses[0], tx, true), {
        code: 'BUS_NOT_FOUND',
      });
      await assert.rejects(() => getBusInTransaction(actor, refs[1], buses[0], tx, true), {
        code: 'BUS_NOT_FOUND',
      });
      checks.push('Stored ownership and bus membership rechecked despite cached grants');
    } finally {
      await tx.rollback();
    }
    stage = 'rollback baseline';
    assert.deepEqual(await snapshot(), before);
    checks.push(
      'All temporary centers, buses, account, choices and settings rolled back; original bus fingerprints unchanged',
    );
    const result = {
      checkedAt: new Date().toISOString(),
      developmentOnly: true,
      rolledBack: true,
      checks,
    };
    await writeFile(
      'docs/generated/transport-sql-checks.json',
      JSON.stringify(result, null, 2) + '\n',
    );
    console.log(JSON.stringify(result));
  } finally {
    await closePools();
  }
}
main().catch((error) => {
  console.error('Bus acceptance failed', {
    stage,
    code: error?.code,
    number: error?.number,
    line: error?.lineNumber,
    assertion:
      error?.code === 'ERR_ASSERTION'
        ? { actual: error.actual, expected: error.expected }
        : undefined,
  });
  process.exitCode = 1;
});
