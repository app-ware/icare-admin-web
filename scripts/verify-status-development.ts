// Explicit development acceptance tooling. Never imported by application requests.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import sql from 'mssql';
import { centerGrants, type PortalActor } from '../src/domain/access';
import type { CenterRef } from '../src/domain/centers';

const marker = `Portal status acceptance ${randomUUID()}`;
const manifestPath = resolve('.local/status-browser-fixture.json');
const checks: string[] = [];
let stage = 'development guards';
type Fixture = { marker: string; centers: CenterRef[]; dealers: number[] };
type Snapshot = Record<string, unknown>;

async function main() {
  assert.equal(process.env.NODE_ENV, 'development', 'Explicit development runtime required');
  assert.ok(process.argv.includes('--development-only'), 'Explicit fixture authorization required');
  loadEnvConfig(process.cwd(), true, { info() {}, error() {} });
  const { developmentSqlCompatibilityEnabled } = await import('../src/server/runtime');
  const { readSqlConfiguration, validateSqlTransport } =
    await import('../src/server/db/configuration');
  assert.ok(developmentSqlCompatibilityEnabled());
  assert.ok(validateSqlTransport(readSqlConfiguration('ICARE_SQL_SECURE')));
  assert.equal(process.env.ICARE_LIVE_DATA_ENABLED, 'true');
  // Keep acceptance receipts separate from the user's sessions/drafts/history.
  process.env.ICARE_STORAGE_PATH = resolve(`.local/status-acceptance-${randomUUID()}.sqlite`);
  const { getPool, closePools } = await import('../src/server/db/pools');
  const { loadDealer } = await import('../src/server/auth/dealers');
  const { getStore } = await import('../src/server/store');
  const { changeStatus, getStatus, getStatusInTransaction, updateStatusInTransaction } =
    await import('../src/server/status/repository');
  const pool = await getPool('secure');
  let page9Available = false;
  const request = (tx?: sql.Transaction) => (tx ? new sql.Request(tx) : pool.request());
  const refRequest = (ref: CenterRef, tx?: sql.Transaction) =>
    request(tx).input('id', sql.Int, ref.id).input('type', sql.Int, ref.type);
  const check = (name: string) => {
    checks.push(name);
    console.log(JSON.stringify({ check: name, passed: true }));
  };
  const data = (revision: string, active: boolean) => ({
    revision,
    active,
    reason: 'Disposable development status acceptance',
  });
  const errorCode = (code: string) => (error: unknown) =>
    Boolean(error && typeof error === 'object' && 'code' in error && error.code === code);
  async function snapshot(): Promise<Snapshot> {
    // Hash existing rows inside SQL; do not export names, contacts or credential columns.
    const result = await request().query(`SELECT
      CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM icare.dbo.Care_Center ORDER BY center_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS nursery,
      CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM icare_school.dbo.Care_Center ORDER BY center_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS school,
      CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM dbo.Center_Status ORDER BY ID FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS statuses,
      CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT dealer_id,dealer_name,username,user_email,is_super_admin,is_active FROM dbo.Dealers ORDER BY dealer_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS dealers,
      CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM dbo.Dealer_Centers ORDER BY ID FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS ownership,
      CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM dbo.Dealer_Page_Center_Access ORDER BY ID FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS grants,
      CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM icare.dbo.Care_Center_Time_Zone_History ORDER BY time_zone_history_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS zones,
      CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM dbo.Admin_Pages ORDER BY admin_page_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS pageReferences,
      CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM dbo.Center_Status_Reference ORDER BY status_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS statusReferences;`);
    return result.recordset[0];
  }
  async function transaction<T>(
    action: (tx: sql.Transaction) => Promise<T>,
    commit = false,
  ): Promise<T> {
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const result = await action(tx);
      if (commit) await tx.commit();
      else await tx.rollback();
      return result;
    } catch (error) {
      await tx.rollback().catch(() => undefined);
      throw error;
    }
  }
  async function createFixtures(all: boolean): Promise<Fixture> {
    return transaction(async (tx) => {
      const fixture: Fixture = { marker, centers: [], dealers: [] };
      stage = 'Nursery fixture insertion';
      // Minimal, fictional rows only. No provisioning/credential/logger procedures or seed repairs.
      const nursery = await request(tx).input('name', sql.NVarChar(sql.MAX), marker).query(`
        DECLARE @ids TABLE(id int);
        INSERT icare.dbo.Care_Center(center_name,type,is_demo) OUTPUT inserted.center_id INTO @ids VALUES(@name,1,1);
        SELECT id AS fixture_id FROM @ids;`);
      fixture.centers.push({ id: nursery.recordset[0].fixture_id, type: 1 });
      if (all) {
        stage = 'Lite fixture insertion';
        const lite = await request(tx).input('name', sql.NVarChar(sql.MAX), marker).query(`
          DECLARE @ids TABLE(id int);
          INSERT icare.dbo.Care_Center(center_name,type,is_demo) OUTPUT inserted.center_id INTO @ids VALUES(@name,3,1);
          SELECT id AS fixture_id FROM @ids;`);
        fixture.centers.push({ id: lite.recordset[0].fixture_id, type: 3 });
        stage = 'School fixture insertion';
        const school = await request(tx).input('name', sql.NVarChar(sql.MAX), marker).query(`
          INSERT icare_school.dbo.Care_Center(center_name,type,is_demo) OUTPUT inserted.center_id AS fixture_id VALUES(@name,4,1);`);
        fixture.centers.push({ id: school.recordset[0].fixture_id, type: 4 });
        for (let i = 0; i < 2; i++) {
          stage = 'credentialless dealer fixture insertion';
          // Deliberately no password/salt/token: these are not usable sign-in accounts.
          const dealer = await request(tx)
            .input('name', sql.NVarChar(450), marker)
            .input('username', sql.NVarChar(450), `status.fixture.${randomUUID()}`).query(`
            INSERT dbo.Dealers(dealer_name,username,is_super_admin,is_active) OUTPUT inserted.dealer_id AS fixture_id VALUES(@name,@username,0,1);`);
          fixture.dealers.push(dealer.recordset[0].fixture_id);
        }
        for (const ref of fixture.centers.slice(0, 2))
          await refRequest(ref, tx)
            .input('dealer', sql.Int, fixture.dealers[0])
            .query(
              'INSERT dbo.Dealer_Centers(dealer_id,center_id,center_type) VALUES(@dealer,@id,@type)',
            );
        stage = 'page-9 fixture assignment';
        if (page9Available)
          await refRequest(fixture.centers[1], tx)
            .input('dealer', sql.Int, fixture.dealers[1])
            .query(
              'INSERT dbo.Dealer_Page_Center_Access(dealer_id,center_id,center_type,page_id) VALUES(@dealer,@id,@type,9)',
            );
      }
      return fixture;
    }, true);
  }
  async function cleanup(fixture: Fixture) {
    await transaction(async (tx) => {
      for (const ref of fixture.centers) {
        const table = ref.type === 4 ? 'icare_school.dbo.Care_Center' : 'icare.dbo.Care_Center';
        const owned = await refRequest(ref, tx)
          .input('marker', sql.NVarChar(sql.MAX), fixture.marker)
          .query(
            `SELECT COUNT(*) AS n FROM ${table} WITH(UPDLOCK,HOLDLOCK) WHERE center_id=@id AND type=@type AND center_name=@marker AND is_demo=1`,
          );
        assert.equal(owned.recordset[0].n, 1, 'Cleanup must match the exact fictional fixture');
        await refRequest(ref, tx).query(
          'DELETE dbo.Center_Status WHERE center_id=@id AND center_type=@type',
        );
        // Refuse to remove unexpected ownership/grants; only this run's credentialless actors qualify.
        const links = await refRequest(ref, tx).query(
          'SELECT dealer_id FROM dbo.Dealer_Centers WHERE center_id=@id AND center_type=@type UNION ALL SELECT dealer_id FROM dbo.Dealer_Page_Center_Access WHERE center_id=@id AND center_type=@type',
        );
        assert.ok(links.recordset.every((r) => fixture.dealers.includes(r.dealer_id)));
        await refRequest(ref, tx).query(
          'DELETE dbo.Dealer_Centers WHERE center_id=@id AND center_type=@type; DELETE dbo.Dealer_Page_Center_Access WHERE center_id=@id AND center_type=@type;',
        );
        if (ref.type !== 4)
          await refRequest(ref, tx).query(
            'DELETE icare.dbo.Care_Center_Time_Zone_History WHERE center_id=@id',
          );
        await refRequest(ref, tx).query(`DELETE ${table} WHERE center_id=@id AND type=@type`);
      }
      for (const id of fixture.dealers) {
        const deleted = await request(tx)
          .input('id', sql.Int, id)
          .input('marker', sql.NVarChar(450), fixture.marker)
          .query(
            `DELETE dbo.Dealers OUTPUT deleted.dealer_id WHERE dealer_id=@id AND dealer_name=@marker AND user_password IS NULL AND password_salt IS NULL AND access_token IS NULL AND is_super_admin=0`,
          );
        assert.equal(deleted.recordset.length, 1);
      }
    }, true);
  }
  try {
    stage = 'metadata and administrator preflight';
    const triggers = await request()
      .query(`SELECT name FROM sys.triggers WHERE is_disabled=0 AND parent_id IN(OBJECT_ID('dbo.Center_Status'),OBJECT_ID('dbo.Dealers'));
      SELECT name FROM icare.sys.triggers WHERE is_disabled=0 AND parent_id=OBJECT_ID('icare.dbo.Care_Center');
      SELECT name FROM icare_school.sys.triggers WHERE is_disabled=0 AND parent_id=OBJECT_ID('icare_school.dbo.Care_Center');`);
    const triggerSets = triggers.recordsets as unknown as { name: string }[][];
    assert.equal(triggerSets[0].length, 0);
    assert.ok(triggerSets[1].every((r) => r.name === 'TR_Care_Center_Time_Zone_History'));
    assert.equal(triggerSets[2].length, 0);
    page9Available =
      (await request().query('SELECT COUNT(*) AS n FROM dbo.Admin_Pages WHERE admin_page_id=9'))
        .recordset[0].n === 1;
    const account = await request()
      .input('username', sql.NVarChar(450), 'icare.test')
      .query(
        'SELECT dealer_id FROM dbo.Dealers WHERE username=@username AND is_active=1 AND is_super_admin=1',
      );
    assert.equal(account.recordset.length, 1);
    const identity = await loadDealer(account.recordset[0].dealer_id);
    assert.ok(identity?.isSuperAdmin);
    const admin: PortalActor = {
      subject: `legacy:${identity.dealerId}`,
      dealerId: identity.dealerId,
      name: identity.name,
      username: identity.username,
      active: true,
      isSuperAdmin: true,
      grants: centerGrants(true, []),
      mode: 'legacy',
      sessionId: 'development-acceptance',
      expiresAt: Date.now() + 30 * 60_000,
    };
    if (process.argv.includes('--cleanup-browser-fixture')) {
      stage = 'browser fixture cleanup';
      const manifest = JSON.parse(await readFile(manifestPath, 'utf8')) as Fixture & {
        before: Snapshot;
        cleaned?: boolean;
      };
      assert.ok(!manifest.cleaned && manifest.marker.startsWith('Portal status acceptance '));
      await cleanup(manifest);
      assert.deepEqual(await snapshot(), manifest.before);
      await writeFile(
        manifestPath,
        JSON.stringify({ ...manifest, cleaned: true }, null, 2) + '\n',
        { mode: 0o600 },
      );
      check('browser fixture removed; existing SQL rows unchanged');
      return;
    }
    const before = await snapshot();
    stage = 'fixture creation';
    if (process.argv.includes('--prepare-browser-fixture')) {
      try {
        const prior = JSON.parse(await readFile(manifestPath, 'utf8'));
        assert.ok(prior.cleaned, 'Clean up the prior browser fixture first');
      } catch (error) {
        if (!(error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'))
          throw error;
      }
      const fixture = await createFixtures(false);
      await writeFile(
        manifestPath,
        JSON.stringify({ ...fixture, before, preparedAt: new Date().toISOString() }, null, 2) +
          '\n',
        { mode: 0o600 },
      );
      console.log(JSON.stringify({ browserFixture: fixture.centers[0], name: fixture.marker }));
      return;
    }
    assert.ok(process.argv.includes('--run'));
    const fixture = await createFixtures(true);
    await writeFile(
      resolve('.local/status-sql-fixture.json'),
      JSON.stringify({ ...fixture, before }, null, 2) + '\n',
      { mode: 0o600 },
    );
    const oldSwitch = process.env.ICARE_STATUS_WRITES_ENABLED;
    process.env.ICARE_STATUS_WRITES_ENABLED = 'true'; // This process only; the portal stays disabled until checks pass.
    try {
      const [nursery, lite, school] = fixture.centers;
      const owner: PortalActor = {
        ...admin,
        dealerId: fixture.dealers[0],
        subject: `legacy:${fixture.dealers[0]}`,
        name: 'Disposable fixture owner',
        username: 'status.fixture.owner',
        isSuperAdmin: false,
        grants: centerGrants(false, [`${nursery.id}_1`, `${lite.id}_3`]),
      };
      const reader: PortalActor = {
        ...owner,
        dealerId: fixture.dealers[1],
        subject: `legacy:${fixture.dealers[1]}`,
        name: 'Disposable fixture reader',
        grants: centerGrants(false, [], [], [`${lite.id}_3`]),
      };
      stage = 'positive status inserts and updates';
      let current = (await getStatus(admin, nursery)).center;
      assert.equal(current.state, 'unknown');
      const initialRevision = current.revision;
      let saved = await changeStatus(admin, nursery, data(current.revision, true));
      assert.equal(saved.center.state, 'active');
      assert.equal(saved.historyRecorded, true);
      assert.equal(saved.history[0].state, 'committed');
      assert.equal((await getStatus(admin, nursery)).center.revision, saved.center.revision);
      await assert.rejects(
        () => changeStatus(admin, nursery, data(initialRevision, false)),
        errorCode('REVISION_CONFLICT'),
      );
      current = (await changeStatus(owner, nursery, data(saved.center.revision, false))).center;
      assert.equal(current.state, 'inactive');
      for (const ref of [lite, school]) {
        const c = (await getStatus(admin, ref)).center;
        assert.equal(
          (await changeStatus(admin, ref, data(c.revision, true))).center.state,
          'active',
        );
      }
      check(
        'Nursery/Lite/School committed inserts, owner update, receipts and stale replay protection',
      );
      stage = 'stored authorization and composite scope';
      if (page9Available) assert.equal((await getStatus(reader, lite)).center.canManage, false);
      else await assert.rejects(() => getStatus(reader, lite), errorCode('CENTER_NOT_FOUND'));
      await assert.rejects(
        () => changeStatus(reader, lite, data(saved.center.revision, false)),
        /Access denied/,
      );
      const forged = { ...reader, isSuperAdmin: true, grants: centerGrants(true, []) };
      const lc = (await getStatus(admin, lite)).center;
      await assert.rejects(
        () => changeStatus(forged, lite, data(lc.revision, false)),
        /Access denied/,
      );
      await assert.rejects(() => getStatus(owner, { id: nursery.id, type: 4 }), /Access denied/);
      await request()
        .input('id', sql.Int, owner.dealerId)
        .query('UPDATE dbo.Dealers SET is_active=0 WHERE dealer_id=@id');
      await assert.rejects(
        () => changeStatus(owner, nursery, data(current.revision, true)),
        /Access denied/,
      );
      await request()
        .input('id', sql.Int, owner.dealerId)
        .query('UPDATE dbo.Dealers SET is_active=1 WHERE dealer_id=@id');
      await request()
        .input('id', sql.Int, reader.dealerId)
        .query('DELETE dbo.Dealer_Page_Center_Access WHERE dealer_id=@id');
      await assert.rejects(() => getStatus(reader, lite), errorCode('CENTER_NOT_FOUND'));
      await refRequest(lite)
        .input('dealer', sql.Int, owner.dealerId)
        .query(
          'DELETE dbo.Dealer_Centers WHERE dealer_id=@dealer AND center_id=@id AND center_type=@type',
        );
      await assert.rejects(() => getStatus(owner, lite), errorCode('CENTER_NOT_FOUND'));
      check('forged role, inactive actor, revoked ownership and cross-type denial');
      check(
        page9Available
          ? 'page-9 viewing is read-only; revoked grant denies access'
          : 'missing page-9 reference left untouched; unowned actor cannot read/write',
      );
      stage = 'duplicate, null and invalid record guards';
      const duplicate = await refRequest(nursery).query(
        'INSERT dbo.Center_Status(center_id,center_type,activation_status) OUTPUT inserted.ID AS fixture_id VALUES(@id,@type,1)',
      );
      let reviewed = (await getStatus(admin, nursery)).center;
      assert.equal(reviewed.state, 'review');
      await assert.rejects(
        () => changeStatus(admin, nursery, data(reviewed.revision, true)),
        errorCode('STATUS_REVIEW_REQUIRED'),
      );
      await request()
        .input('id', sql.Int, duplicate.recordset[0].fixture_id)
        .query('DELETE dbo.Center_Status WHERE ID=@id');
      for (const value of [null, 7]) {
        await refRequest(nursery)
          .input('code', sql.Int, value)
          .query(
            'UPDATE dbo.Center_Status SET activation_status=@code WHERE center_id=@id AND center_type=@type',
          );
        reviewed = (await getStatus(admin, nursery)).center;
        assert.equal(reviewed.state, 'review');
        await assert.rejects(
          () => changeStatus(admin, nursery, data(reviewed.revision, true)),
          errorCode('STATUS_REVIEW_REQUIRED'),
        );
      }
      await refRequest(nursery).query(
        'UPDATE dbo.Center_Status SET activation_status=0 WHERE center_id=@id AND center_type=@type',
      );
      check('duplicate/null/unrecognized rows block all writes');
      stage = 'rollback and competing writers';
      const baseline = (await getStatus(admin, nursery)).center;
      await transaction(async (tx) => {
        const c = await getStatusInTransaction(tx, admin, nursery);
        assert.equal(
          (await updateStatusInTransaction(tx, admin, nursery, data(c.revision, true), () => {}))
            .state,
          'active',
        );
      });
      assert.equal((await getStatus(admin, nursery)).center.revision, baseline.revision);
      // Different actors prove status locking, rather than just the actor-row lock.
      const a = new sql.Transaction(pool),
        b = new sql.Transaction(pool);
      await a.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      await b.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
      try {
        await updateStatusInTransaction(a, admin, nursery, data(baseline.revision, true), () => {});
        let settled = false;
        const competing = updateStatusInTransaction(
          b,
          owner,
          nursery,
          data(baseline.revision, true),
          () => {},
        )
          .then(
            () => ({ ok: true }),
            (error) => ({ ok: false, error }),
          )
          .finally(() => {
            settled = true;
          });
        await new Promise((resolve) => setTimeout(resolve, 250));
        assert.equal(settled, false, 'Competing status update must wait for the first transaction');
        await a.commit();
        const outcome = await competing;
        assert.equal(outcome.ok, false);
        assert.ok('error' in outcome && errorCode('REVISION_CONFLICT')(outcome.error));
      } finally {
        await a.rollback().catch(() => {});
        await b.rollback().catch(() => {});
      }
      assert.equal((await getStatus(admin, nursery)).center.state, 'active');
      check(
        'SQL rollback restores exact revision; competing writer blocks and rejects stale revision',
      );
      stage = 'receipt failure before commit';
      const store = getStore();
      current = (await getStatus(admin, nursery)).center;
      store.db.exec(
        "CREATE TEMP TRIGGER fail_status_intent BEFORE INSERT ON center_status_operations BEGIN SELECT RAISE(ABORT,'acceptance'); END;",
      );
      try {
        await assert.rejects(() => changeStatus(admin, nursery, data(current.revision, false)));
      } finally {
        store.db.exec('DROP TRIGGER fail_status_intent');
      }
      assert.equal((await getStatus(admin, nursery)).center.revision, current.revision);
      store.db.exec(
        "CREATE TEMP TRIGGER fail_status_attempt BEFORE UPDATE ON center_status_operations WHEN NEW.state='unconfirmed' BEGIN SELECT RAISE(ABORT,'acceptance'); END;",
      );
      try {
        await assert.rejects(() => changeStatus(admin, nursery, data(current.revision, false)));
      } finally {
        store.db.exec('DROP TRIGGER fail_status_attempt');
      }
      assert.equal((await getStatus(admin, nursery)).center.revision, current.revision);
      assert.equal((await getStatus(admin, nursery)).history[0].state, 'failed');
      check('receipt outages before intent and after SQL update roll back status safely');
      stage = 'uncertain commit acknowledgement';
      const prototype = sql.Transaction.prototype as unknown as { commit: () => Promise<void> };
      const commit = prototype.commit;
      prototype.commit = async function () {
        await commit.call(this);
        throw new Error('Simulated lost commit acknowledgement');
      };
      try {
        await assert.rejects(
          () => changeStatus(admin, nursery, data(current.revision, false)),
          errorCode('STATUS_OUTCOME_UNCONFIRMED'),
        );
      } finally {
        prototype.commit = commit;
      }
      const recovered = await getStatus(admin, nursery);
      assert.equal(recovered.center.state, 'inactive');
      assert.equal(recovered.history[0].state, 'unconfirmed');
      await assert.rejects(
        () => changeStatus(admin, nursery, data(recovered.center.revision, false)),
        errorCode('STATUS_UNCHANGED'),
      );
      check(
        'lost commit acknowledgement yields unconfirmed outcome; reload recovers persisted state',
      );
      stage = 'receipt failure after confirmed SQL commit';
      store.db.exec(
        "CREATE TEMP TRIGGER fail_status_confirmation BEFORE UPDATE ON center_status_operations WHEN NEW.state='committed' BEGIN SELECT RAISE(ABORT,'acceptance'); END;",
      );
      try {
        saved = await changeStatus(admin, nursery, data(recovered.center.revision, true));
      } finally {
        store.db.exec('DROP TRIGGER fail_status_confirmation');
      }
      assert.equal(saved.center.state, 'active');
      assert.equal(saved.historyRecorded, false);
      assert.equal((await getStatus(admin, nursery)).center.state, 'active');
      check('confirmed SQL save remains successful when receipt confirmation fails');
    } finally {
      process.env.ICARE_STATUS_WRITES_ENABLED = oldSwitch;
      const priorStage = stage;
      stage = 'fixture cleanup and baseline comparison';
      await cleanup(fixture);
      assert.deepEqual(await snapshot(), before);
      check('all fixture centers/dealers/statuses/mappings removed; existing rows unchanged');
      stage = priorStage;
    }
    await writeFile(
      resolve('docs/generated/status-sql-checks.json'),
      JSON.stringify(
        {
          checkedOn: '2026-10-25',
          checks,
          page9FixtureAvailable: page9Available,
          persistentFixtureRows: false,
          existingRowsUnchanged: true,
          usesLegacyLogger: false,
          note: 'Rolled-back/deleted fixture inserts can advance identity sequences; acceptance receipts use a private dedicated SQLite file. Missing page references are not repaired.',
        },
        null,
        2,
      ) + '\n',
    );
  } finally {
    await closePools();
  }
}
main().catch((error: unknown) => {
  // SQL exception messages/stacks may include private infrastructure details.
  console.error(
    JSON.stringify({
      acceptance: 'failed',
      stage,
      category: error instanceof Error ? error.name : 'UnknownError',
      code:
        error && typeof error === 'object' && 'code' in error
          ? String(error.code).slice(0, 40)
          : undefined,
      sqlNumber: error && typeof error === 'object' && 'number' in error ? error.number : undefined,
    }),
  );
  process.exitCode = 1;
});
