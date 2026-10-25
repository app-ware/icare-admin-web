// Explicit fixture tooling, separate from application runtime. Requires the confirmed dev connection.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import sql from 'mssql';
import { centerGrants, type PortalActor } from '../src/domain/access';
import type { CenterRef } from '../src/domain/centers';
import type { AlertBatchInput } from '../src/domain/alerts';
type Fixture = {
  marker: string;
  centers: CenterRef[];
  dealer: number | null;
  before: Record<string, unknown>;
  cleaned?: boolean;
};
let stage = 'development guards';
const checks: string[] = [];
async function main() {
  assert.equal(process.env.NODE_ENV, 'development');
  assert.ok(process.argv.includes('--development-only'));
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const { readSqlConfiguration, validateSqlTransport } =
    await import('../src/server/db/configuration');
  assert.ok(validateSqlTransport(readSqlConfiguration('ICARE_SQL_SECURE')));
  assert.equal(process.env.ICARE_LIVE_DATA_ENABLED, 'true');
  process.env.ICARE_STORAGE_PATH = resolve(`.local/alert-acceptance-${randomUUID()}.sqlite`);
  const { getPool, closePools } = await import('../src/server/db/pools');
  const { loadDealer } = await import('../src/server/auth/dealers');
  const { getAlert, getAlertBatch, listAlerts, submitAlertBatch, retryAlertBatch } =
    await import('../src/server/alerts/repository');
  const { alertQuerySchema } = await import('../src/domain/alerts');
  const { getStore } = await import('../src/server/store');
  const pool = await getPool('secure'),
    manifestPath = resolve('.local/alert-browser-fixture.json');
  const request = (tx?: sql.Transaction) => (tx ? new sql.Request(tx) : pool.request());
  const check = (name: string) => {
    checks.push(name);
    console.log(JSON.stringify({ check: name, passed: true }));
  };
  async function transaction<T>(action: (tx: sql.Transaction) => Promise<T>) {
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const result = await action(tx);
      await tx.commit();
      return result;
    } catch (e) {
      await tx.rollback().catch(() => {});
      throw e;
    }
  }
  async function snapshot() {
    return (
      await request().query(`SELECT
    CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM icare.dbo.Care_Center ORDER BY center_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS nursery,
    CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM icare_school.dbo.Care_Center ORDER BY center_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS school,
    CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM icare.dbo.Center_Alert_Message ORDER BY alert_message_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS nurseryAlerts,
    CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM icare_school.dbo.Center_Alert_Message ORDER BY alert_message_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS schoolAlerts,
    CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT dealer_id,dealer_name,username,is_super_admin,is_active FROM dbo.Dealers ORDER BY dealer_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS dealers,
    CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM dbo.Dealer_Centers ORDER BY ID FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS ownership,
    CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM dbo.Dealer_Page_Center_Access ORDER BY ID FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS grants,
    CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM dbo.Admin_Pages ORDER BY admin_page_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS pageReferences,
    CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM icare.dbo.Care_Center_Time_Zone_History ORDER BY time_zone_history_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS zones;`)
    ).recordset[0];
  }
  async function prepare(all: boolean): Promise<Fixture> {
    const fixture: Fixture = {
      marker: `Portal alert acceptance ${randomUUID()}`,
      centers: [],
      dealer: null,
      before: await snapshot(),
    };
    await transaction(async (tx) => {
      for (const type of all ? ([1, 3, 4] as const) : ([1] as const)) {
        const table = type === 4 ? 'icare_school.dbo.Care_Center' : 'icare.dbo.Care_Center';
        const row = await request(tx)
          .input('name', sql.NVarChar(sql.MAX), fixture.marker)
          .input('type', sql.Int, type)
          .query(
            `DECLARE @ids TABLE(id int);INSERT ${table}(center_name,type,is_demo) OUTPUT inserted.center_id INTO @ids VALUES(@name,@type,1);SELECT id FROM @ids;`,
          );
        fixture.centers.push({ id: row.recordset[0].id, type });
      }
      if (all) {
        const d = await request(tx)
          .input('name', sql.NVarChar(450), fixture.marker)
          .input('username', sql.NVarChar(450), `alert.fixture.${randomUUID()}`)
          .query(
            'INSERT dbo.Dealers(dealer_name,username,is_super_admin,is_active) OUTPUT inserted.dealer_id AS id VALUES(@name,@username,0,1)',
          );
        fixture.dealer = d.recordset[0].id;
        await request(tx)
          .input('dealer', sql.Int, fixture.dealer)
          .input('id', sql.Int, fixture.centers[0].id)
          .query(
            'INSERT dbo.Dealer_Centers(dealer_id,center_id,center_type) VALUES(@dealer,@id,1)',
          );
      }
    });
    return fixture;
  }
  async function cleanup(f: Fixture) {
    await transaction(async (tx) => {
      for (const ref of f.centers) {
        const table = ref.type === 4 ? 'icare_school.dbo.Care_Center' : 'icare.dbo.Care_Center',
          alerts =
            ref.type === 4
              ? 'icare_school.dbo.Center_Alert_Message'
              : 'icare.dbo.Center_Alert_Message';
        const own = await request(tx)
          .input('id', sql.Int, ref.id)
          .input('type', sql.Int, ref.type)
          .input('marker', sql.NVarChar(sql.MAX), f.marker)
          .query(
            `SELECT COUNT(*) AS n FROM ${table} WITH(UPDLOCK,HOLDLOCK) WHERE center_id=@id AND type=@type AND center_name=@marker AND is_demo=1`,
          );
        assert.equal(own.recordset[0].n, 1);
        const owners = await request(tx)
          .input('id', sql.Int, ref.id)
          .input('type', sql.Int, ref.type)
          .query(
            'SELECT dealer_id FROM dbo.Dealer_Centers WHERE center_id=@id AND center_type=@type',
          );
        assert.ok(owners.recordset.every((r) => r.dealer_id === f.dealer));
        await request(tx)
          .input('id', sql.Int, ref.id)
          .input('type', sql.Int, ref.type)
          .query(
            `DELETE ${alerts} WHERE center_id=@id;DELETE dbo.Dealer_Centers WHERE center_id=@id AND center_type=@type;${ref.type === 4 ? '' : 'DELETE icare.dbo.Care_Center_Time_Zone_History WHERE center_id=@id;'}DELETE ${table} WHERE center_id=@id AND type=@type;`,
          );
      }
      if (f.dealer) {
        const r = await request(tx)
          .input('id', sql.Int, f.dealer)
          .input('marker', sql.NVarChar(450), f.marker)
          .query(
            'DELETE dbo.Dealers OUTPUT deleted.dealer_id WHERE dealer_id=@id AND dealer_name=@marker AND user_password IS NULL AND password_salt IS NULL AND access_token IS NULL AND is_super_admin=0',
          );
        assert.equal(r.recordset.length, 1);
      }
    });
    assert.deepEqual(await snapshot(), f.before);
  }
  try {
    stage = 'live metadata preflight';
    const triggers = await request().query(
      `SELECT name FROM icare.sys.triggers WHERE parent_id=OBJECT_ID('icare.dbo.Center_Alert_Message') AND is_disabled=0;SELECT name FROM icare_school.sys.triggers WHERE parent_id=OBJECT_ID('icare_school.dbo.Center_Alert_Message') AND is_disabled=0;`,
    );
    const sets = triggers.recordsets as unknown as unknown[][];
    assert.equal(sets[0].length + sets[1].length, 0);
    if (process.argv.includes('--cleanup-browser-fixture')) {
      const f: Fixture = JSON.parse(await readFile(manifestPath, 'utf8'));
      assert.ok(!f.cleaned && f.marker.startsWith('Portal alert acceptance '));
      await cleanup(f);
      await writeFile(manifestPath, JSON.stringify({ ...f, cleaned: true }, null, 2) + '\n', {
        mode: 0o600,
      });
      check('browser fixture removed; existing SQL rows unchanged');
      return;
    }
    if (process.argv.includes('--prepare-browser-fixture')) {
      try {
        assert.ok(JSON.parse(await readFile(manifestPath, 'utf8')).cleaned);
      } catch (e) {
        if (!(e && typeof e === 'object' && 'code' in e && e.code === 'ENOENT')) throw e;
      }
      const f = await prepare(true);
      await writeFile(manifestPath, JSON.stringify(f, null, 2) + '\n', { mode: 0o600 });
      console.log(JSON.stringify({ browserFixture: f.centers[0], name: f.marker }));
      return;
    }
    assert.ok(process.argv.includes('--run'));
    const ids = await request()
      .input('username', sql.NVarChar(450), 'icare.test')
      .query(
        'SELECT dealer_id FROM dbo.Dealers WHERE username=@username AND is_active=1 AND is_super_admin=1',
      );
    assert.equal(ids.recordset.length, 1);
    const identity = await loadDealer(ids.recordset[0].dealer_id);
    assert.ok(identity?.isSuperAdmin);
    const admin: PortalActor = {
      subject: `legacy:${identity.dealerId}`,
      dealerId: identity.dealerId,
      name: identity.name,
      username: identity.username,
      isSuperAdmin: true,
      mode: 'legacy',
      active: true,
      expiresAt: Date.now() + 30 * 60_000,
      sessionId: 'development-acceptance',
      grants: centerGrants(true, []),
    };
    const f = await prepare(true);
    await writeFile(resolve('.local/alert-sql-fixture.json'), JSON.stringify(f, null, 2) + '\n', {
      mode: 0o600,
    });
    const oldSwitch = process.env.ICARE_ALERT_WRITES_ENABLED;
    process.env.ICARE_ALERT_WRITES_ENABLED = 'true';
    const make = async (
      actor: PortalActor,
      refs: CenterRef[],
      message = 'Disposable development alert acceptance',
    ): Promise<AlertBatchInput> => ({
      id: randomUUID(),
      action: 'publish',
      message,
      expiryDate: '2099-01-01',
      targets: await Promise.all(
        refs.map(async (ref) => ({ ...ref, revision: (await getAlert(actor, ref)).revision })),
      ),
    });
    try {
      stage = 'read, publish and idempotency';
      assert.equal((await listAlerts(admin, alertQuerySchema.parse({ q: f.marker }))).total, 3);
      const input = await make(admin, f.centers);
      let result = await submitAlertBatch(admin, input);
      assert.ok(result.targets.every((t) => t.state === 'succeeded'));
      assert.ok((await submitAlertBatch(admin, input)).targets.every((t) => t.attempts === 1));
      for (const ref of f.centers)
        assert.equal(
          (await getAlert(admin, ref)).message,
          'Disposable development alert acceptance',
        );
      check(
        'Nursery/Lite/School publish and read-back; same batch never replays confirmed targets',
      );
      stage = 'ownership and partial failure';
      const owner: PortalActor = {
        ...admin,
        dealerId: f.dealer!,
        subject: `legacy:${f.dealer}`,
        name: 'Credentialless fixture owner',
        isSuperAdmin: false,
        grants: centerGrants(false, [`${f.centers[0].id}_1`]),
      };
      const mixed = await make(admin, f.centers, 'Owner scope test');
      result = await submitAlertBatch(owner, mixed);
      assert.equal(result.targets.filter((t) => t.state === 'succeeded').length, 1);
      assert.equal(result.targets.filter((t) => t.state === 'failed').length, 2);
      const forged = { ...owner, isSuperAdmin: true, grants: centerGrants(true, []) };
      result = await submitAlertBatch(forged, await make(admin, [f.centers[1]], 'Forged scope'));
      assert.equal(result.targets[0].state, 'failed');
      assert.ok(['ACCESS_DENIED', 'ACCESS_UNAVAILABLE'].includes(result.targets[0].code ?? ''));
      await assert.rejects(
        () =>
          submitAlertBatch(owner, { id: randomUUID(), action: 'reset', targets: mixed.targets }),
        /Access denied/,
      );
      check(
        'owner-only publication, forged administrator denial and independent administrator-only reset',
      );
      stage = 'stale and ambiguous records';
      result = await submitAlertBatch(admin, {
        ...input,
        id: randomUUID(),
        action: 'publish',
        message: 'Stale update',
        expiryDate: '2099-01-01',
      });
      if (result.targets.some((t) => t.retryable)) result = await retryAlertBatch(admin, result.id);
      result = await getAlertBatch(admin, result.id);
      assert.ok(result.targets.every((t) => t.code === 'REVISION_CONFLICT'));
      const ref = f.centers[0];
      const existing = await getAlert(admin, ref);
      await request()
        .input('id', sql.Int, ref.id)
        .query('UPDATE icare.dbo.Center_Alert_Message SET message_text=NULL WHERE center_id=@id');
      assert.equal((await getAlert(admin, ref)).state, 'review');
      await request()
        .input('id', sql.Int, ref.id)
        .input('blank', sql.NVarChar(250), '\n\t\u00a0')
        .query('UPDATE icare.dbo.Center_Alert_Message SET message_text=@blank WHERE center_id=@id');
      assert.ok(
        (
          await listAlerts(admin, alertQuerySchema.parse({ q: f.marker, state: 'review' }))
        ).items.some((c) => c.id === ref.id && c.type === ref.type),
      );
      const invalid = await make(admin, [ref], 'Invalid record test');
      result = await submitAlertBatch(admin, invalid);
      assert.equal(result.targets[0].code, 'ALERT_REVIEW_REQUIRED');
      await request()
        .input('id', sql.Int, ref.id)
        .input('message', sql.NVarChar(250), existing.message)
        .query(
          'UPDATE icare.dbo.Center_Alert_Message SET message_text=@message WHERE center_id=@id',
        );
      check('stale targets and invalid stored alerts fail without overwriting data');
      stage = 'SQL rollback on receipt failure';
      const before = await getAlert(admin, ref),
        store = getStore();
      store.db.exec(
        "CREATE TEMP TRIGGER fail_alert_precommit BEFORE UPDATE ON alert_batch_targets WHEN NEW.state='unconfirmed' BEGIN SELECT RAISE(ABORT,'acceptance'); END;",
      );
      try {
        result = await submitAlertBatch(admin, await make(admin, [ref], 'Rollback test'));
      } finally {
        store.db.exec('DROP TRIGGER fail_alert_precommit');
      }
      assert.equal(result.targets[0].state, 'failed');
      assert.equal((await getAlert(admin, ref)).revision, before.revision);
      result = await retryAlertBatch(admin, result.id);
      assert.equal(result.targets[0].state, 'succeeded');
      assert.equal(result.targets[0].attempts, 2);
      check('precommit receipt failure rolls SQL back; retry changes only the failed target');
      stage = 'lost commit acknowledgement';
      const prototype = sql.Transaction.prototype as unknown as { commit: () => Promise<void> },
        commit = prototype.commit;
      let lose = true;
      prototype.commit = async function () {
        await commit.call(this);
        if (lose) {
          lose = false;
          throw new Error('Simulated lost acknowledgement');
        }
      };
      try {
        result = await submitAlertBatch(
          admin,
          await make(admin, [ref, f.centers[2]], 'Uncertain commit test'),
        );
      } finally {
        prototype.commit = commit;
      }
      assert.equal(result.targets.filter((t) => t.state === 'unconfirmed').length, 1);
      assert.equal(result.targets.filter((t) => t.state === 'succeeded').length, 1);
      assert.equal((await getAlert(admin, ref)).message, 'Uncertain commit test');
      assert.ok((await retryAlertBatch(admin, result.id)).targets.every((t) => t.attempts === 1));
      check(
        'uncertain commit is visible; confirmed and unconfirmed targets are never blindly retried',
      );
      stage = 'administrator reset';
      const resetTargets = await Promise.all(
        f.centers.map(async (r) => ({ ...r, revision: (await getAlert(admin, r)).revision })),
      );
      result = await submitAlertBatch(admin, {
        id: randomUUID(),
        action: 'reset',
        targets: resetTargets,
      });
      assert.ok(result.targets.every((t) => t.state === 'succeeded'));
      for (const r of f.centers) assert.equal((await getAlert(admin, r)).state, 'none');
      check('administrator reset removes only the selected stored alerts');
      const staleEmpty = await submitAlertBatch(admin, { ...input, id: randomUUID() });
      assert.ok(staleEmpty.targets.every((t) => t.code === 'REVISION_CONFLICT'));
      check('durable generations reject stale empty-state views after publish/reset cycles');
    } finally {
      if (oldSwitch === undefined) delete process.env.ICARE_ALERT_WRITES_ENABLED;
      else process.env.ICARE_ALERT_WRITES_ENABLED = oldSwitch;
      const prior = stage;
      stage = 'fixture cleanup';
      await cleanup(f);
      check(
        'all disposable rows removed; existing centers/alerts/accounts/mappings/references unchanged',
      );
      stage = prior;
    }
    await writeFile(
      resolve('docs/generated/alerts-sql-checks.json'),
      JSON.stringify(
        {
          checkedOn: '2026-10-25',
          checks,
          existingRowsUnchanged: true,
          persistentFixtureRows: false,
          usesLegacyLogger: false,
          note: 'Identity sequences may advance; private acceptance receipts are separate from normal sessions and drafts.',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await closePools();
  }
}
main().catch((e: unknown) => {
  console.error(
    JSON.stringify({
      acceptance: 'failed',
      stage,
      category: e instanceof Error ? e.name : 'UnknownError',
      assertion: e instanceof assert.AssertionError ? e.message.slice(0, 500) : undefined,
      code: e && typeof e === 'object' && 'code' in e ? e.code : undefined,
      sqlNumber: e && typeof e === 'object' && 'number' in e ? e.number : undefined,
    }),
  );
  process.exitCode = 1;
});
