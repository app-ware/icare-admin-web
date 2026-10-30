// Dev-only disposable fixtures. No provider calls, existing credential readback or committed writes.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { loadEnvConfig } from '@next/env';
import sql from 'mssql';
import { centerGrants, type PortalActor } from '../src/domain/access';
import { centerKey, type CenterRef } from '../src/domain/centers';
import { cowpayQuerySchema } from '../src/domain/cowpay';
let stage = 'development guards';
async function main() {
  assert.equal(process.env.NODE_ENV, 'development');
  assert.ok(process.argv.includes('--development-only'));
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const { developmentSqlCompatibilityEnabled } = await import('../src/server/runtime');
  assert.ok(developmentSqlCompatibilityEnabled());
  process.env.ICARE_STORAGE_PATH = resolve(`.local/cowpay-acceptance-${randomUUID()}.sqlite`);
  const { getPool, closePools } = await import('../src/server/db/pools');
  const { getLiveCowpay, listLiveCowpay } = await import('../src/server/cowpay/repository');
  const pool = await getPool('secure'),
    tx = new sql.Transaction(pool),
    checks: string[] = [];
  const snapshot = async () => {
    const r = await pool.request().query(`SELECT
      CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT ID,center_id,center_type,is_enabled,update_time FROM icare.dbo.Cowpay_Center_Api_Settings ORDER BY ID FOR JSON PATH,INCLUDE_NULL_VALUES)),2) settings,
      (SELECT COUNT(*) FROM icare.dbo.Care_Center) nursery,
      (SELECT COUNT(*) FROM icare_school.dbo.Care_Center) school,
      (SELECT COUNT(*) FROM icare_secure.dbo.Dealers) dealers,
      (SELECT COUNT(*) FROM icare_secure.dbo.Dealer_Centers) links;`);
    return r.recordset[0];
  };
  try {
    const before = await snapshot();
    stage = 'trigger guard';
    const triggers = await pool
      .request()
      .query(
        "SELECT t.name FROM icare.sys.triggers t JOIN icare.sys.objects o ON t.parent_id=o.object_id WHERE o.name='Cowpay_Center_Api_Settings' AND t.is_disabled=0;",
      );
    assert.equal(triggers.recordset.length, 0);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      stage = 'credentialless actor and disposable centers';
      const marker = `Portal CowPay acceptance ${randomUUID()}`,
        secretMarker = `NONPRODUCTION-REDACTION-FIXTURE-${randomUUID()}`;
      const inserted = await new sql.Request(tx)
        .input('name', sql.NVarChar(450), marker)
        .input('username', sql.NVarChar(450), `cowpay.fixture.${randomUUID()}`)
        .query(
          'INSERT icare_secure.dbo.Dealers(dealer_name,username,is_super_admin,is_active) OUTPUT inserted.dealer_id id VALUES(@name,@username,0,1);',
        );
      const actorId = Number(inserted.recordset[0].id),
        refs: CenterRef[] = [];
      for (const type of [1, 3, 4] as const) {
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
        sessionId: 'cowpay-acceptance',
        grants: centerGrants(false, refs.map(centerKey)),
      };
      const query = cowpayQuerySchema.parse({});
      const initial = await listLiveCowpay(actor, query, tx);
      assert.equal(initial.total, 2);
      assert.ok(initial.items.every((r) => r.setup === 'unconfigured' && r.storedEnabled === null));
      await assert.rejects(() => getLiveCowpay(actor, refs[2], tx));
      checks.push(
        'Nursery/Lite ownership retained; School rejected; missing settings stay unconfigured with unknown enablement',
      );
      for (const ref of refs.slice(0, 2)) {
        stage = `type ${ref.type} secret-free projection`;
        await new sql.Request(tx)
          .input('center', sql.Int, ref.id)
          .input('type', sql.Int, ref.type)
          .input('secret', sql.NVarChar(sql.MAX), secretMarker)
          .query(
            `INSERT icare.dbo.Cowpay_Center_Api_Settings(center_id,center_type,merchant_code,merchant_hash_key,access_token,staging_access_token,is_enabled,creation_date,update_time) VALUES(@center,@type,@secret,@secret,@secret,N'  ',0,GETUTCDATE(),GETUTCDATE());`,
          );
        const detail = await getLiveCowpay(actor, ref, tx);
        assert.equal(detail.credentials.merchantCode, true);
        assert.equal(detail.liveComplete, true);
        assert.equal(detail.stagingComplete, false);
        assert.equal(detail.storedEnabled, false);
        assert.equal(JSON.stringify(detail).includes(secretMarker), false);
        for (const field of [
          'merchant_hash_key',
          'access_token',
          'staging_access_token',
          'default_customer_email',
        ])
          assert.equal(JSON.stringify(detail).includes(field), false);
        assert.match(detail.updatedAt!, /Z$/);
        await new sql.Request(tx)
          .input('center', sql.Int, ref.id)
          .query(
            "UPDATE icare.dbo.Cowpay_Center_Api_Settings SET merchant_hash_key=N' ',staging_access_token=N'fixture' WHERE center_id=@center;",
          );
        const incomplete = await getLiveCowpay(actor, ref, tx);
        assert.equal(incomplete.credentials.merchantHash, false);
        assert.equal(incomplete.liveComplete, false);
        assert.equal(incomplete.stagingComplete, false);
        await new sql.Request(tx)
          .input('center', sql.Int, ref.id)
          .input('secret', sql.NVarChar(sql.MAX), secretMarker)
          .query(
            'UPDATE icare.dbo.Cowpay_Center_Api_Settings SET merchant_hash_key=@secret,is_enabled=NULL WHERE center_id=@center;',
          );
        assert.equal((await getLiveCowpay(actor, ref, tx)).setup, 'review');
        await new sql.Request(tx)
          .input('center', sql.Int, ref.id)
          .query(
            'UPDATE icare.dbo.Cowpay_Center_Api_Settings SET is_enabled=1,center_type=NULL WHERE center_id=@center;',
          );
        const mismatch = await getLiveCowpay(actor, ref, tx);
        assert.equal(mismatch.setup, 'review');
        assert.equal(mismatch.credentials.liveToken, null);
        await new sql.Request(tx)
          .input('center', sql.Int, ref.id)
          .input('type', sql.Int, ref.type)
          .query(
            'UPDATE icare.dbo.Cowpay_Center_Api_Settings SET center_type=@type WHERE center_id=@center; INSERT icare.dbo.Cowpay_Center_Api_Settings(center_id,center_type,is_enabled) VALUES(@center,@type,0);',
          );
        const duplicate = await getLiveCowpay(actor, ref, tx);
        assert.equal(duplicate.setup, 'review');
        assert.equal(duplicate.configured, null);
        assert.equal(duplicate.storedEnabled, null);
        checks.push(
          `Type ${ref.type}: credential presence only, independent live/staging fields, blank shared key, null enablement, mismatched type and duplicate-row guards`,
        );
      }
      stage = 'filters and scope';
      assert.equal((await listLiveCowpay(actor, { ...query, setup: 'review' }, tx)).total, 2);
      assert.equal((await listLiveCowpay(actor, { ...query, type: '3' }, tx)).total, 1);
      assert.equal((await listLiveCowpay(actor, { ...query, enabled: 'unknown' }, tx)).total, 2);
      assert.equal((await listLiveCowpay(actor, { ...query, enabled: 'enabled' }, tx)).total, 0);
      assert.equal((await listLiveCowpay(actor, { ...query, page: 2 }, tx)).total, 2);
      assert.equal((await listLiveCowpay(actor, { ...query, page: 2 }, tx)).items.length, 0);
      assert.equal((await listLiveCowpay(actor, { ...query, q: "%' OR 1=1 --" }, tx)).total, 0);
      await new sql.Request(tx)
        .input('actor', sql.Int, actorId)
        .query('DELETE icare_secure.dbo.Dealer_Centers WHERE dealer_id=@actor;');
      await assert.rejects(
        () => getLiveCowpay({ ...actor, grants: centerGrants(true, []) }, refs[0], tx),
        { code: 'COWPAY_CENTER_NOT_FOUND' },
      );
      assert.equal((await listLiveCowpay(actor, query, tx)).total, 0);
      await new sql.Request(tx)
        .input('actor', sql.Int, actorId)
        .query('UPDATE icare_secure.dbo.Dealers SET is_active=0 WHERE dealer_id=@actor;');
      await assert.rejects(() => getLiveCowpay(actor, refs[1], tx), {
        code: 'COWPAY_CENTER_NOT_FOUND',
      });
      checks.push(
        'Filtered totals/pagination, parameterized search, current stored ownership/active role and no cached administrator bypass verified',
      );
    } finally {
      await tx.rollback();
    }
    stage = 'rollback metadata baseline';
    assert.deepEqual(await snapshot(), before);
    checks.push(
      'Temporary account/centers/fake credentials rolled back; original settings metadata fingerprints and center/account/link counts match; no provider calls or existing secret readback',
    );
    const result = {
      checkedAt: new Date().toISOString(),
      developmentOnly: true,
      rolledBack: true,
      checks,
    };
    await writeFile(
      'docs/generated/cowpay-sql-checks.json',
      JSON.stringify(result, null, 2) + '\n',
    );
    console.log(JSON.stringify(result));
  } finally {
    await closePools();
  }
}
main().catch((error) => {
  console.error('CowPay acceptance failed', {
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
