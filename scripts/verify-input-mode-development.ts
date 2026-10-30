// Explicit dev-only acceptance. Temporary choices/account/centers/settings always roll back.
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
  const { developmentSqlCompatibilityEnabled, inputModeWritesEnabled } =
    await import('../src/server/runtime');
  assert.ok(developmentSqlCompatibilityEnabled());
  assert.equal(inputModeWritesEnabled(), false);
  process.env.ICARE_STORAGE_PATH = resolve(`.local/input-mode-acceptance-${randomUUID()}.sqlite`);
  const { getPool, closePools } = await import('../src/server/db/pools');
  const { readLiveInputMode, updateLiveInputMode, changeInputMode } =
    await import('../src/server/input-mode/repository');
  const pool = await getPool('secure'),
    tx = new sql.Transaction(pool),
    checks: string[] = [];
  const snapshot = async () => {
    const hashes: string[] = [];
    for (const db of ['icare', 'icare_school']) {
      const result = await pool.request()
        .query(`SELECT CONVERT(varchar(64),HASHBYTES('SHA2_256',CONCAT(
        (SELECT center_id,type,center_name FROM ${db}.dbo.Care_Center ORDER BY center_id FOR JSON PATH,INCLUDE_NULL_VALUES),
        (SELECT ID,center_id,input_type_id FROM ${db}.dbo.Center_Child_Input_Type ORDER BY ID FOR JSON PATH,INCLUDE_NULL_VALUES),
        (SELECT input_type_id,input_type_desc,is_enabled FROM ${db}.dbo.Input_Type ORDER BY input_type_id,input_type_desc FOR JSON PATH,INCLUDE_NULL_VALUES))),2) fingerprint;`);
      hashes.push(result.recordset[0].fingerprint);
    }
    const secure = await pool
      .request()
      .query(
        `SELECT COUNT(*) dealers,(SELECT COUNT(*) FROM icare_secure.dbo.Dealer_Centers) links FROM icare_secure.dbo.Dealers;`,
      );
    return [...hashes, secure.recordset[0]];
  };
  try {
    stage = 'reference and trigger guards';
    const before = await snapshot();
    for (const db of ['icare', 'icare_school']) {
      const r = await pool.request().query(`SELECT COUNT(*) n FROM ${db}.dbo.Input_Type;
        SELECT t.name FROM ${db}.sys.triggers t JOIN ${db}.sys.objects o ON o.object_id=t.parent_id WHERE o.name IN('Center_Child_Input_Type','Input_Type') AND t.is_disabled=0;`);
      assert.equal(
        r.recordset[0].n,
        0,
        'Use an isolated catalog after real input choices are populated',
      );
      assert.equal((r.recordsets as sql.IRecordSet<unknown>[])[1].length, 0);
    }
    checks.push('Both dev input catalogs empty; no input-table triggers; no seed repair performed');
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      stage = 'credentialless fixtures';
      const marker = `Portal input-mode acceptance ${randomUUID()}`;
      const account = await new sql.Request(tx)
        .input('name', sql.NVarChar(450), marker)
        .input('user', sql.NVarChar(450), `input.fixture.${randomUUID()}`)
        .query(
          'INSERT icare_secure.dbo.Dealers(dealer_name,username,is_super_admin,is_active) OUTPUT inserted.dealer_id id VALUES(@name,@user,0,1)',
        );
      const actorId = Number(account.recordset[0].id),
        refs: CenterRef[] = [];
      for (const type of [1, 3, 4] as const) {
        const db = type === 4 ? 'icare_school' : 'icare';
        const r = await new sql.Request(tx)
          .input('name', sql.NVarChar(sql.MAX), marker)
          .input('type', sql.Int, type)
          .query(
            `DECLARE @ids TABLE(id int); INSERT ${db}.dbo.Care_Center(center_name,type,is_demo) OUTPUT inserted.center_id INTO @ids VALUES(@name,@type,1); SELECT id FROM @ids;`,
          );
        const ref = { id: Number(r.recordset[0].id), type };
        refs.push(ref);
        await new sql.Request(tx)
          .input('actor', sql.Int, actorId)
          .input('center', sql.Int, ref.id)
          .input('type', sql.Int, type)
          .query(
            'INSERT icare_secure.dbo.Dealer_Centers(dealer_id,center_id,center_type) VALUES(@actor,@center,@type)',
          );
      }
      const actor: PortalActor = {
        subject: `legacy:${actorId}`,
        dealerId: actorId,
        mode: 'legacy',
        name: 'Acceptance',
        username: 'fixture',
        active: true,
        expiresAt: Date.now() + 300000,
        isSuperAdmin: false,
        sessionId: 'input-acceptance',
        grants: centerGrants(false, refs.map(centerKey)),
      };
      for (const ref of refs) {
        const current = await readLiveInputMode(actor, ref, tx, true);
        assert.ok(current.issues.length);
        await assert.rejects(
          () =>
            updateLiveInputMode(
              actor,
              ref,
              { action: 'override', revision: current.revision, inputType: 1 },
              tx,
            ),
          { code: 'INPUT_MODE_REVIEW' },
        );
      }
      stage = 'temporary reference choices';
      for (const db of ['icare', 'icare_school']) {
        await new sql.Request(tx)
          .query(`INSERT ${db}.dbo.Input_Type(input_type_id,input_type_desc,is_enabled) VALUES(1,N'Acceptance manual',1),(2,N'Acceptance card',1),(3,N'Acceptance QR',1);
          INSERT ${db}.dbo.Center_Child_Input_Type(center_id,input_type_id) VALUES(-1,1);`);
      }
      for (const ref of refs) {
        stage = `type ${ref.type} override and inheritance`;
        const current = await readLiveInputMode(actor, ref, tx, true);
        assert.equal(current.inputType, 1);
        assert.equal(current.source, 'inherited');
        const changed = await updateLiveInputMode(
          actor,
          ref,
          { action: 'override', revision: current.revision, inputType: 2 },
          tx,
        );
        assert.equal(changed.previous.inputType, 1);
        assert.equal(changed.saved.inputType, 2);
        await assert.rejects(
          () =>
            updateLiveInputMode(
              actor,
              ref,
              { action: 'override', revision: current.revision, inputType: 1 },
              tx,
            ),
          { code: 'REVISION_CONFLICT' },
        );
        await assert.rejects(
          () =>
            updateLiveInputMode(
              actor,
              ref,
              { action: 'override', revision: changed.saved.revision, inputType: 99 },
              tx,
            ),
          { code: 'INVALID_INPUT_MODE' },
        );
        await assert.rejects(
          () =>
            updateLiveInputMode(
              actor,
              ref,
              { action: 'override', revision: changed.saved.revision, inputType: 3 },
              tx,
            ),
          { code: 'QR_INTEGRATION_PENDING' },
        );
        const inherited = await updateLiveInputMode(
          actor,
          ref,
          { action: 'inherit', revision: changed.saved.revision },
          tx,
        );
        assert.equal(inherited.saved.inputType, 1);
        assert.equal(inherited.saved.source, 'inherited');
        const db = ref.type === 4 ? 'icare_school' : 'icare';
        await new sql.Request(tx)
          .input('center', sql.Int, ref.id)
          .query(
            `INSERT ${db}.dbo.Center_Child_Input_Type(center_id,input_type_id) VALUES(@center,1),(@center,2);`,
          );
        const duplicate = await readLiveInputMode(actor, ref, tx, true);
        await assert.rejects(
          () =>
            updateLiveInputMode(
              actor,
              ref,
              { action: 'override', revision: duplicate.revision, inputType: 2 },
              tx,
            ),
          { code: 'INPUT_MODE_REVIEW' },
        );
        await new sql.Request(tx)
          .input('center', sql.Int, ref.id)
          .query(`DELETE ${db}.dbo.Center_Child_Input_Type WHERE center_id=@center;`);
        checks.push(
          `Type ${ref.type}: inherited choice, override insert/readback, stale/invalid/duplicate denial and default restoration; live QR blocked`,
        );
      }
      stage = 'current scope and write gates';
      await assert.rejects(() => readLiveInputMode(actor, { id: refs[0].id, type: 4 }, tx, true));
      await assert.rejects(
        () =>
          changeInputMode(actor, refs[0], {
            action: 'override',
            revision: 'a'.repeat(64),
            inputType: 1,
          }),
        { code: 'INPUT_MODE_WRITES_DISABLED' },
      );
      await new sql.Request(tx)
        .input('actor', sql.Int, actorId)
        .query('DELETE icare_secure.dbo.Dealer_Centers WHERE dealer_id=@actor');
      await assert.rejects(() => readLiveInputMode(actor, refs[0], tx, true), {
        code: 'SETTINGS_NOT_FOUND',
      });
      await new sql.Request(tx)
        .input('actor', sql.Int, actorId)
        .query('UPDATE icare_secure.dbo.Dealers SET is_active=0 WHERE dealer_id=@actor');
      await assert.rejects(() => readLiveInputMode(actor, refs[1], tx, true), {
        code: 'SETTINGS_NOT_FOUND',
      });
      checks.push(
        'Composite scope, stored membership/active dealer, separate write gate rechecked',
      );
    } finally {
      await tx.rollback();
    }
    stage = 'rollback fingerprints';
    assert.deepEqual(await snapshot(), before);
    checks.push(
      'All temporary references, settings, centers and credentialless actor rolled back; original fingerprints/counts unchanged; no child/QR rows read or written',
    );
    const result = {
      checkedAt: new Date().toISOString(),
      developmentOnly: true,
      rolledBack: true,
      checks,
    };
    await writeFile(
      'docs/generated/input-mode-sql-checks.json',
      JSON.stringify(result, null, 2) + '\n',
    );
    console.log(JSON.stringify(result));
  } finally {
    await closePools();
  }
}
main().catch((error) => {
  console.error('Input-mode acceptance failed', {
    stage,
    code: error?.code,
    number: error?.number,
    assertion:
      error?.code === 'ERR_ASSERTION'
        ? { actual: error.actual, expected: error.expected }
        : undefined,
  });
  process.exitCode = 1;
});
