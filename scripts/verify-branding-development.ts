// Explicit dev acceptance, separate from runtime. SQL fixtures are marker-guarded and removed.
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { loadEnvConfig } from '@next/env';
import sharp from 'sharp';
import sql from 'mssql';
import { centerGrants, type PortalActor } from '../src/domain/access';
import { centerKey, type CenterRef } from '../src/domain/centers';
import { emptyProfile, type SavedDraft } from '../src/domain/management';
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
  process.env.ICARE_STORAGE_PATH = resolve(`.local/branding-acceptance-${randomUUID()}.sqlite`);
  process.env.ICARE_BRANDING_WRITES_ENABLED = 'true';
  const { getPool, closePools } = await import('../src/server/db/pools');
  const { getStore } = await import('../src/server/store');
  const { getBranding, stageBranding, publishBranding, readBrandingImage, discardBranding } =
    await import('../src/server/branding/repository');
  const pool = await getPool('secure'),
    marker = `Portal branding acceptance ${randomUUID()}`,
    refs: CenterRef[] = [],
    dealers: number[] = [],
    checks: string[] = [];
  const request = (tx?: sql.Transaction) => (tx ? new sql.Request(tx) : pool.request());
  async function transaction<T>(action: (tx: sql.Transaction) => Promise<T>) {
    const tx = new sql.Transaction(pool);
    await tx.begin(sql.ISOLATION_LEVEL.SERIALIZABLE);
    try {
      const result = await action(tx);
      await tx.commit();
      return result;
    } catch (e) {
      await tx.rollback().catch(() => undefined);
      throw e;
    }
  }
  async function snapshot() {
    return (
      await request().query(`SELECT
 CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM icare.dbo.Care_Center ORDER BY center_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS nursery,
 CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM icare_school.dbo.Care_Center ORDER BY center_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS school,
 CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT dealer_id,dealer_name,username,is_super_admin,is_active FROM dbo.Dealers ORDER BY dealer_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS dealers,
 CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM dbo.Dealer_Centers ORDER BY ID FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS links,
 CONVERT(varchar(64),HASHBYTES('SHA2_256',(SELECT * FROM icare.dbo.Care_Center_Time_Zone_History ORDER BY time_zone_history_id FOR JSON PATH,INCLUDE_NULL_VALUES)),2) AS zones;`)
    ).recordset[0];
  }
  let prepared = false;
  try {
    const before = await snapshot();
    stage = 'disposable fixture insertion';
    await transaction(async (tx) => {
      for (const type of [1, 3, 4] as const) {
        const db = type === 4 ? 'icare_school' : 'icare';
        const r = await request(tx)
          .input('name', sql.NVarChar(sql.MAX), marker)
          .input('type', sql.Int, type)
          .query(
            `DECLARE @ids TABLE(id int); INSERT ${db}.dbo.Care_Center(center_name,type,is_demo) OUTPUT inserted.center_id INTO @ids VALUES(@name,@type,1); SELECT id FROM @ids;`,
          );
        refs.push({ id: r.recordset[0].id, type });
      }
      for (const admin of [false, true]) {
        const r = await request(tx)
          .input('name', sql.NVarChar(450), marker)
          .input('username', sql.NVarChar(450), `branding.fixture.${randomUUID()}`)
          .input('admin', sql.Bit, admin)
          .query(
            'INSERT dbo.Dealers(dealer_name,username,is_super_admin,is_active) OUTPUT inserted.dealer_id AS id VALUES(@name,@username,@admin,1)',
          );
        dealers.push(r.recordset[0].id);
      }
      for (const ref of refs)
        await request(tx)
          .input('actor', sql.Int, dealers[0])
          .input('id', sql.Int, ref.id)
          .input('type', sql.Int, ref.type)
          .query(
            'INSERT dbo.Dealer_Centers(dealer_id,center_id,center_type) VALUES(@actor,@id,@type)',
          );
    });
    prepared = true;
    try {
      const owner: PortalActor = {
        subject: `legacy:${dealers[0]}`,
        dealerId: dealers[0],
        mode: 'legacy',
        name: 'Fixture',
        username: 'fixture',
        active: true,
        expiresAt: Date.now() + 5 * 60000,
        isSuperAdmin: false,
        sessionId: 'acceptance',
        grants: centerGrants(false, refs.map(centerKey)),
      };
      const admin: PortalActor = {
        ...owner,
        subject: `legacy:${dealers[1]}`,
        dealerId: dealers[1],
        isSuperAdmin: true,
        grants: centerGrants(true, []),
      };
      const bytes = await sharp({
        create: { width: 150, height: 80, channels: 4, background: '#318adb' },
      })
        .png()
        .toBuffer();
      const watermarkBytes = await sharp({
        create: {
          width: 1024,
          height: 1024,
          channels: 4,
          background: { r: 40, g: 100, b: 180, alpha: 0.5 },
        },
      })
        .png()
        .toBuffer();
      const drafts = await import('../src/server/drafts/repository');
      const ownedDrafts: SavedDraft[] = [];
      process.env.ICARE_BRANDING_WRITES_ENABLED = 'false';
      try {
        const plain = await drafts.saveDraft(owner, {
          type: 1,
          domain: `plain${randomUUID().replaceAll('-', '')}`,
          profile: { ...emptyProfile, name: 'Fictional profile-only draft' },
          branding: { watermark: null },
        });
        const updated = await drafts.saveDraft(
          owner,
          { ...plain.data, profile: { ...plain.data.profile, name: 'Fictional profile edit' } },
          plain.id,
          plain.revision,
        );
        assert.equal(updated.branding.watermark, null);
        await drafts.deleteDraft(owner, updated.id, updated.revision);
      } finally {
        process.env.ICARE_BRANDING_WRITES_ENABLED = 'true';
      }
      checks.push(
        'Profile-only drafts with an empty watermark remain writable while branding changes are disabled',
      );
      for (const ref of refs) {
        stage = `type ${ref.type} owned draft images`;
        const initial = await drafts.saveDraft(owner, {
          type: ref.type,
          domain: `draft${randomUUID().replaceAll('-', '')}`,
          profile: { ...emptyProfile, name: 'Fictional acceptance draft' },
        });
        const logo = await drafts.stageDraftImage(
          owner,
          initial.id,
          'logo',
          bytes,
          'image/png',
          'png',
        );
        const photo = await drafts.stageDraftImage(
          owner,
          initial.id,
          'photo',
          bytes,
          'image/png',
          'png',
        );
        const watermark = await drafts.stageDraftImage(
          owner,
          initial.id,
          'watermark',
          watermarkBytes,
          'image/png',
          'png',
        );
        const saved = await drafts.saveDraft(
          owner,
          {
            ...initial.data,
            branding: { logo: logo.id, photo: photo.id, watermark: watermark.id },
          },
          initial.id,
          initial.revision,
        );
        assert.equal((await drafts.getDraft(owner, saved.id)).branding.watermark?.id, watermark.id);
        await assert.rejects(() => drafts.readDraftImage(admin, saved.id, watermark.id), {
          code: 'DRAFT_NOT_FOUND',
        });
        await assert.rejects(() => drafts.publishDraft(owner, saved.id, saved.revision), {
          code: 'PROVISIONING_PENDING',
        });
        process.env.ICARE_BRANDING_WRITES_ENABLED = 'false';
        try {
          assert.equal((await drafts.getDraftBranding(owner, saved.id)).canManage, false);
          await assert.rejects(
            () =>
              drafts.saveDraft(owner, { ...saved.data, branding: {} }, saved.id, saved.revision),
            { code: 'BRANDING_WRITES_DISABLED' },
          );
          await assert.rejects(() => drafts.deleteDraft(owner, saved.id, saved.revision), {
            code: 'BRANDING_WRITES_DISABLED',
          });
          await assert.rejects(
            () =>
              drafts.saveDraft(
                owner,
                { ...saved.data, branding: { ...saved.data.branding, watermark: null } },
                saved.id,
                saved.revision,
              ),
            { code: 'BRANDING_WRITES_DISABLED' },
          );
          assert.equal((await drafts.getDraft(owner, saved.id)).revision, saved.revision);
        } finally {
          process.env.ICARE_BRANDING_WRITES_ENABLED = 'true';
        }
        ownedDrafts.push(saved);
        checks.push(
          `Type ${ref.type}: private logo/photo/watermark draft save/resume, uploader isolation, independent gate and live provisioning denial`,
        );
      }
      for (const ref of refs) {
        stage = `type ${ref.type} private branding`;
        const initial = await getBranding(owner, ref),
          logo = await stageBranding(owner, ref, 'logo', bytes, 'image/png', 'png'),
          photo = await stageBranding(owner, ref, 'photo', bytes, 'image/png', 'png');
        await assert.rejects(() => readBrandingImage(admin, ref, logo.id), {
          code: 'IMAGE_NOT_FOUND',
        });
        const watermark = await stageBranding(
          owner,
          ref,
          'watermark',
          watermarkBytes,
          'image/png',
          'png',
        );
        await assert.rejects(() => readBrandingImage(admin, ref, watermark.id), {
          code: 'IMAGE_NOT_FOUND',
        });
        assert.equal((await getBranding(owner, ref)).logo, null);
        const saved = await publishBranding(owner, ref, {
          revision: initial.revision,
          logo: logo.id,
          photo: photo.id,
          watermark: watermark.id,
        });
        assert.equal(saved.logo?.id, logo.id);
        assert.equal((await readBrandingImage(admin, ref, watermark.id)).mime, 'image/png');
        assert.equal((await readBrandingImage(admin, ref, photo.id)).mime, 'image/jpeg');
        const next = await stageBranding(owner, ref, 'logo', bytes, 'image/png', 'png');
        await assert.rejects(
          () => publishBranding(owner, ref, { revision: initial.revision, logo: next.id }),
          { code: 'BRANDING_CONFLICT' },
        );
        const store = getStore();
        store.db.exec(
          "CREATE TEMP TRIGGER fail_branding_operation BEFORE INSERT ON branding_operations BEGIN SELECT RAISE(ABORT,'acceptance'); END",
        );
        try {
          await assert.rejects(() =>
            publishBranding(owner, ref, { revision: saved.revision, logo: next.id }),
          );
        } finally {
          store.db.exec('DROP TRIGGER fail_branding_operation');
        }
        assert.equal((await getBranding(owner, ref)).revision, saved.revision);
        assert.ok((await readBrandingImage(owner, ref, logo.id)).data.length);
        const removed = await publishBranding(owner, ref, {
          revision: saved.revision,
          watermark: null,
        });
        assert.equal(removed.watermark, null);
        assert.equal(removed.logo?.id, logo.id);
        await assert.rejects(() => readBrandingImage(admin, ref, watermark.id), {
          code: 'IMAGE_NOT_FOUND',
        });
        await assert.rejects(
          () => publishBranding(owner, ref, { revision: saved.revision, watermark: null }),
          { code: 'BRANDING_CONFLICT' },
        );
        process.env.ICARE_BRANDING_WRITES_ENABLED = 'false';
        try {
          await assert.rejects(
            () => publishBranding(owner, ref, { revision: removed.revision, watermark: null }),
            { code: 'BRANDING_WRITES_DISABLED' },
          );
        } finally {
          process.env.ICARE_BRANDING_WRITES_ENABLED = 'true';
        }
        await discardBranding(owner, ref, next.id);
        checks.push(
          `Type ${ref.type}: owner logo/photo/watermark upload, private preview, atomic publication/removal, admin read, stale save, write gate and receipt rollback`,
        );
      }
      stage = 'stored access revocation';
      const ref = refs[0],
        image = (await getBranding(owner, ref)).logo!;
      await request()
        .input('actor', sql.Int, owner.dealerId)
        .query('UPDATE dbo.Dealers SET is_active=0 WHERE dealer_id=@actor');
      await assert.rejects(() => readBrandingImage(owner, ref, image.id), {
        code: 'IMAGE_NOT_FOUND',
      });
      await assert.rejects(() =>
        drafts.readDraftImage(owner, ownedDrafts[0].id, ownedDrafts[0].branding.logo!.id),
      );
      await request()
        .input('actor', sql.Int, owner.dealerId)
        .query(
          'UPDATE dbo.Dealers SET is_active=1 WHERE dealer_id=@actor; DELETE dbo.Dealer_Centers WHERE dealer_id=@actor',
        );
      await assert.rejects(
        () => getBranding({ ...owner, isSuperAdmin: true, grants: centerGrants(true, []) }, ref),
        { code: 'IMAGE_NOT_FOUND' },
      );
      await assert.rejects(() => readBrandingImage(owner, ref, image.id), {
        code: 'IMAGE_NOT_FOUND',
      });
      checks.push(
        'Current SQL account status, ownership and forged administrator claims fail closed',
      );
      for (const draft of ownedDrafts) {
        assert.equal((await drafts.getDraft(owner, draft.id)).revision, draft.revision);
        await drafts.deleteDraft(owner, draft.id, draft.revision);
      }
      checks.push(
        'Drafts remain private to their active owner independently of existing-center assignments; draft media deleted with owned drafts',
      );
    } finally {
      stage = 'marker-guarded cleanup';
      await transaction(async (tx) => {
        for (const ref of refs) {
          const db = ref.type === 4 ? 'icare_school' : 'icare';
          const exists = await request(tx)
            .input('id', sql.Int, ref.id)
            .input('type', sql.Int, ref.type)
            .input('marker', sql.NVarChar(sql.MAX), marker)
            .query(
              `SELECT 1 AS ok FROM ${db}.dbo.Care_Center WHERE center_id=@id AND type=@type AND center_name=@marker`,
            );
          assert.equal(exists.recordset.length, 1);
        }
        for (const id of dealers) {
          const exists = await request(tx)
            .input('id', sql.Int, id)
            .input('marker', sql.NVarChar(450), marker)
            .query(
              "SELECT 1 AS ok FROM dbo.Dealers WHERE dealer_id=@id AND dealer_name=@marker AND username LIKE N'branding.fixture.%'",
            );
          assert.equal(exists.recordset.length, 1);
        }
        for (const id of dealers)
          await request(tx)
            .input('id', sql.Int, id)
            .query(
              'DELETE dbo.Dealer_Centers WHERE dealer_id=@id; DELETE dbo.Dealers WHERE dealer_id=@id',
            );
        for (const ref of refs) {
          const db = ref.type === 4 ? 'icare_school' : 'icare';
          await request(tx)
            .input('id', sql.Int, ref.id)
            .input('type', sql.Int, ref.type)
            .query(
              `${ref.type === 4 ? '' : 'DELETE icare.dbo.Care_Center_Time_Zone_History WHERE center_id=@id;'}DELETE ${db}.dbo.Care_Center WHERE center_id=@id AND type=@type`,
            );
        }
      });
      prepared = false;
    }
    stage = 'baseline comparison';
    assert.deepEqual(await snapshot(), before);
    checks.push(
      'Disposable SQL rows removed; all original centers, legacy branding fields, accounts, mappings and timezone history unchanged',
    );
    const result = {
      checkedAt: new Date().toISOString(),
      privatePortalStorage: true,
      existingRowsUnchanged: true,
      persistentSqlFixtureRows: false,
      checks,
    };
    await writeFile(
      'docs/generated/branding-sql-checks.json',
      JSON.stringify(result, null, 2) + '\n',
    );
    console.log(JSON.stringify(result));
  } finally {
    if (prepared) console.error('Disposable branding fixtures require guarded cleanup.');
    await closePools();
  }
}
main().catch((e) => {
  console.error('Branding acceptance failed', {
    stage,
    code: e?.code,
    number: e?.number,
    line: e?.lineNumber,
    assertionAt:
      typeof e?.stack === 'string'
        ? e.stack.match(/verify-branding-development\.ts:\d+:\d+/)?.[0]
        : undefined,
    actualCode: e?.actual?.code,
    expectedCode: e?.expected?.code,
  });
  process.exitCode = 1;
});
