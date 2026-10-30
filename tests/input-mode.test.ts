import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import jsQR from 'jsqr';
import { centerGrants, type PortalActor } from '../src/domain/access';
import { inputModeChangeSchema, qrStartSchema, resolveInputMode } from '../src/domain/input-mode';
import { getInputMode, changeInputMode } from '../src/server/input-mode/repository';
import { startQrJob, getQrJob, actOnQrJob, readQrImage } from '../src/server/input-mode/jobs';
import { renderDemoQr } from '../src/server/input-mode/render';
import { getStore } from '../src/server/store';
import { emptyProfile } from '../src/domain/management';
import { getBranding, stageBranding, publishBranding } from '../src/server/branding/repository';

process.env.ICARE_STORAGE_PATH = ':memory:';
process.env.ICARE_LIVE_DATA_ENABLED = 'false';
const actor: PortalActor = {
  subject: 'preview:900002',
  dealerId: 900002,
  mode: 'preview',
  name: 'Operator',
  username: 'demo.dealer',
  active: true,
  expiresAt: Date.now() + 600000,
  isSuperAdmin: false,
  sessionId: 'input-mode-test',
  grants: centerGrants(false, ['101_1', '103_1']),
};
const admin: PortalActor = {
  ...actor,
  subject: 'preview:900001',
  dealerId: 900001,
  isSuperAdmin: true,
  grants: centerGrants(true, []),
};
const ref = { id: 101, type: 1 } as const;
const choices = [
  { id: 1, label: 'Manual', enabled: true },
  { id: 3, label: 'QR', enabled: true },
];
const start = async (who = actor, center = ref) =>
  startQrJob(who, center, {
    revision: (await getInputMode(who, center)).revision,
    requestId: randomUUID(),
    useWatermark: false,
  });

test('input-mode contracts preserve catalog inheritance and reject missing, duplicate and disabled references', () => {
  const rows = [{ id: 1, centerId: -1, inputType: 1 }];
  assert.equal(resolveInputMode(rows, choices, 101).source, 'inherited');
  assert.equal(
    resolveInputMode([...rows, { id: 2, centerId: 101, inputType: 3 }], choices, 101).inputType,
    3,
  );
  for (const [r, c] of [
    [rows, []],
    [[...rows, ...rows], choices],
    [rows, [...choices, ...choices]],
    [[], choices],
    [[{ id: 1, centerId: 101, inputType: 99 }], choices],
    [rows, [{ ...choices[0], enabled: false }]],
  ] as const)
    assert.ok(resolveInputMode([...r], [...c], 101).issues.length);
  assert.equal(
    inputModeChangeSchema.safeParse({
      action: 'override',
      revision: 'a'.repeat(64),
      inputType: 3,
      centerId: 2,
    }).success,
    false,
  );
  assert.equal(
    qrStartSchema.safeParse({
      revision: 'a'.repeat(64),
      requestId: randomUUID(),
      useWatermark: false,
      childId: 12,
    }).success,
    false,
  );
});
test('mode changes preserve independent revisions, current stored ownership, default inheritance and live gates', async () => {
  let current = await getInputMode(actor, ref);
  const original = current.revision;
  current = await changeInputMode(actor, ref, {
    action: 'override',
    revision: current.revision,
    inputType: 2,
  });
  assert.equal(current.source, 'override');
  assert.equal(current.inputType, 2);
  await assert.rejects(
    () => changeInputMode(actor, ref, { action: 'override', revision: original, inputType: 1 }),
    { code: 'REVISION_CONFLICT' },
  );
  current = await changeInputMode(actor, ref, { action: 'inherit', revision: current.revision });
  assert.equal(current.source, 'inherited');
  assert.notEqual(current.revision, original);
  await assert.rejects(
    () =>
      changeInputMode(actor, ref, { action: 'override', revision: current.revision, inputType: 3 }),
    { code: 'QR_JOB_REQUIRED' },
  );
  await assert.rejects(() => getInputMode(actor, { id: ref.id, type: 4 }));
  await assert.rejects(
    () =>
      changeInputMode({ ...actor, mode: 'legacy' }, ref, {
        action: 'override',
        revision: current.revision,
        inputType: 1,
      }),
    { code: 'INPUT_MODE_WRITES_DISABLED' },
  );
  getStore()
    .db.prepare(
      'DELETE FROM preview_dealer_centers WHERE dealer_id=? AND center_id=? AND center_type=?',
    )
    .run(actor.dealerId, ref.id, ref.type);
  await assert.rejects(() => getInputMode(actor, ref));
  getStore()
    .db.prepare('INSERT INTO preview_dealer_centers VALUES(?,?,?)')
    .run(actor.dealerId, ref.id, ref.type);
});
test('demo QR images scan to explicit fictional values with and without a normalized watermark', async () => {
  const payload = `ICARE-DEMO:${randomUUID()}`;
  const mark = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 30, g: 90, b: 180, alpha: 0.4 },
    },
  })
    .png()
    .toBuffer();
  for (const stamp of [null, mark]) {
    const image = await renderDemoQr(payload, stamp),
      meta = await sharp(image).metadata();
    assert.equal(meta.width, 768);
    assert.equal(meta.height, 768);
    assert.equal(meta.exif, undefined);
    const { data, info } = await sharp(image)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    assert.equal(jsQR(new Uint8ClampedArray(data), info.width, info.height)?.data, payload);
  }
  await assert.rejects(() => renderDemoQr('real-child-token', null));
});
test('owned QR jobs are idempotent, resumable, private and applied only after all images verify', async () => {
  const current = await getInputMode(actor, ref),
    request = { revision: current.revision, requestId: randomUUID(), useWatermark: false };
  let job = await startQrJob(actor, ref, request);
  assert.equal((await startQrJob(actor, ref, request)).id, job.id);
  await assert.rejects(() => startQrJob(actor, ref, { ...request, useWatermark: true }), {
    code: 'REQUEST_CONFLICT',
  });
  await assert.rejects(() => getQrJob(admin, ref, job.id), { code: 'QR_JOB_NOT_FOUND' });
  await assert.rejects(() => getQrJob(actor, { id: 103, type: 1 }, job.id), {
    code: 'QR_JOB_NOT_FOUND',
  });
  await assert.rejects(() => getQrJob({ ...actor, mode: 'legacy' }, ref, job.id), {
    code: 'QR_INTEGRATION_PENDING',
  });
  assert.equal(JSON.stringify(job).includes('payload'), false);
  assert.equal(JSON.stringify(job).includes('ICARE-DEMO'), false);
  await assert.rejects(
    () =>
      changeInputMode(actor, ref, {
        action: 'override',
        revision: current.revision,
        inputType: 3,
        jobId: job.id,
      }),
    { code: 'REVISION_CONFLICT' },
  );
  job = await actOnQrJob(actor, ref, job.id, { action: 'advance' });
  assert.equal(job.ready, 1);
  assert.equal((await getInputMode(actor, ref)).job?.id, job.id);
  const image = await readQrImage(actor, ref, job.id, job.items[0].id);
  await assert.rejects(() => readQrImage(admin, ref, job.id, job.items[0].id));
  await assert.rejects(() => actOnQrJob(actor, ref, job.id, { action: 'retry' }), {
    code: 'QR_RETRY_UNAVAILABLE',
  });
  await actOnQrJob(actor, ref, job.id, { action: 'advance' });
  job = await actOnQrJob(actor, ref, job.id, { action: 'advance' });
  assert.equal(job.state, 'ready');
  assert.equal(job.ready, 3);
  assert.deepEqual(await readQrImage(actor, ref, job.id, job.items[0].id), image);
  assert.equal((await actOnQrJob(actor, ref, job.id, { action: 'advance' })).ready, 3);
  const saved = await changeInputMode(actor, ref, {
    action: 'override',
    revision: current.revision,
    inputType: 3,
    jobId: job.id,
  });
  assert.equal(saved.inputType, 3);
  assert.equal(saved.job?.state, 'applied');
  await assert.rejects(() => actOnQrJob(actor, ref, job.id, { action: 'cancel' }), {
    code: 'QR_JOB_FINISHED',
  });
});
test('QR failures retry only failed targets and keep successful images; expired rendering leases resume safely', async () => {
  let job = await start();
  job = await actOnQrJob(actor, ref, job.id, { action: 'advance' });
  const ready = await readQrImage(actor, ref, job.id, job.items[0].id);
  getStore()
    .db.prepare('UPDATE qr_jobs SET watermark_data=? WHERE id=?')
    .run(Buffer.from('broken fixture'), job.id);
  await actOnQrJob(actor, ref, job.id, { action: 'advance' });
  job = await actOnQrJob(actor, ref, job.id, { action: 'advance' });
  assert.equal(job.state, 'failed');
  assert.equal(job.failed, 2);
  await assert.rejects(() => actOnQrJob(actor, ref, job.id, { action: 'advance' }), {
    code: 'QR_JOB_PAUSED',
  });
  getStore().db.prepare('UPDATE qr_jobs SET watermark_data=NULL WHERE id=?').run(job.id);
  await actOnQrJob(actor, ref, job.id, { action: 'retry' });
  const target = job.items[1].id;
  getStore()
    .db.prepare("UPDATE qr_items SET state='rendering',lease='old',lease_until=? WHERE id=?")
    .run(Date.now() + 10000, target);
  await assert.rejects(() => actOnQrJob(actor, ref, job.id, { action: 'advance' }), {
    code: 'QR_JOB_BUSY',
  });
  getStore().db.prepare('UPDATE qr_items SET lease_until=0 WHERE id=?').run(target);
  await actOnQrJob(actor, ref, job.id, { action: 'advance' });
  job = await actOnQrJob(actor, ref, job.id, { action: 'advance' });
  assert.equal(job.state, 'ready');
  assert.deepEqual(await readQrImage(actor, ref, job.id, job.items[0].id), ready);
  await actOnQrJob(actor, ref, job.id, { action: 'cancel' });
  await assert.rejects(() => readQrImage(actor, ref, job.id, job.items[0].id), {
    code: 'QR_IMAGE_UNAVAILABLE',
  });
});
test('QR jobs reject stale mode/watermark revisions, revoked actors and expired jobs', async () => {
  let job = await start();
  const current = await getInputMode(actor, ref);
  await changeInputMode(actor, ref, {
    action: 'override',
    revision: current.revision,
    inputType: 1,
  });
  await assert.rejects(() => actOnQrJob(actor, ref, job.id, { action: 'advance' }), {
    code: 'REVISION_CONFLICT',
  });
  await actOnQrJob(actor, ref, job.id, { action: 'cancel' });
  job = await start();
  getStore().db.prepare('UPDATE preview_dealers SET active=0 WHERE id=?').run(actor.dealerId);
  await assert.rejects(() => getQrJob(actor, ref, job.id));
  await assert.rejects(() => actOnQrJob(actor, ref, job.id, { action: 'advance' }));
  getStore().db.prepare('UPDATE preview_dealers SET active=1 WHERE id=?').run(actor.dealerId);
  getStore().db.prepare('UPDATE qr_jobs SET expires_at=0 WHERE id=?').run(job.id);
  await assert.rejects(() => getQrJob(actor, ref, job.id), { code: 'QR_JOB_NOT_FOUND' });
  const png = await sharp({
    create: {
      width: 1024,
      height: 1024,
      channels: 4,
      background: { r: 20, g: 100, b: 160, alpha: 0.4 },
    },
  })
    .png()
    .toBuffer();
  const branding = await getBranding(actor, ref),
    staged = await stageBranding(actor, ref, 'watermark', png, 'image/png', 'png');
  job = await start();
  await publishBranding(actor, ref, { revision: branding.revision, watermark: staged.id });
  await assert.rejects(() => actOnQrJob(actor, ref, job.id, { action: 'advance' }), {
    code: 'REVISION_CONFLICT',
  });
  await actOnQrJob(actor, ref, job.id, { action: 'cancel' });
  const marked = await startQrJob(actor, ref, {
    revision: (await getInputMode(actor, ref)).revision,
    requestId: randomUUID(),
    useWatermark: true,
  });
  assert.equal(marked.useWatermark, true);
  assert.equal((await actOnQrJob(actor, ref, marked.id, { action: 'advance' })).ready, 1);
  await actOnQrJob(actor, ref, marked.id, { action: 'cancel' });
});
test('QR request quotas and forged fields fail closed without selecting live repositories', async () => {
  const a = await start(),
    b = await start(),
    c = await start();
  await assert.rejects(() => start(), { code: 'QR_JOB_LIMIT' });
  await assert.rejects(() =>
    startQrJob(actor, ref, { revision: '', requestId: randomUUID(), useWatermark: false }),
  );
  for (const job of [a, b, c]) await actOnQrJob(actor, ref, job.id, { action: 'cancel' });
});

test('all center types keep QR jobs separate and roll back mode/publication when the receipt fails', async () => {
  const store = getStore();
  for (const type of [1, 3, 4] as const) {
    const center = { id: 980001, type };
    store.db
      .prepare(
        'INSERT INTO preview_centers(id,type,domain,profile,active,owner_id,time_zone) VALUES(?,?,?,?,1,?,NULL)',
      )
      .run(
        center.id,
        type,
        `qrfixture${type}`,
        JSON.stringify({ ...emptyProfile, name: `Fictional QR type ${type}` }),
        admin.dealerId,
      );
    const initial = await getInputMode(admin, center);
    let job = await startQrJob(admin, center, {
      revision: initial.revision,
      requestId: randomUUID(),
      useWatermark: false,
    });
    for (let i = 0; i < 3; i++)
      job = await actOnQrJob(admin, center, job.id, { action: 'advance' });
    assert.equal(job.state, 'ready');
    store.db.exec(
      "CREATE TRIGGER fail_input_receipt BEFORE INSERT ON input_mode_operations BEGIN SELECT RAISE(ABORT,'fixture'); END;",
    );
    try {
      await assert.rejects(() =>
        changeInputMode(admin, center, {
          action: 'override',
          revision: initial.revision,
          inputType: 3,
          jobId: job.id,
        }),
      );
    } finally {
      store.db.exec('DROP TRIGGER fail_input_receipt');
    }
    assert.equal((await getInputMode(admin, center)).inputType, 1);
    assert.equal((await getQrJob(admin, center, job.id)).state, 'ready');
    const saved = await changeInputMode(admin, center, {
      action: 'override',
      revision: initial.revision,
      inputType: 3,
      jobId: job.id,
    });
    assert.equal(saved.inputType, 3);
    await assert.rejects(() =>
      readQrImage(admin, { id: center.id, type: type === 4 ? 1 : 4 }, job.id, job.items[0].id),
    );
  }
});
