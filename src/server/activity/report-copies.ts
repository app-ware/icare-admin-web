import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import {
  assertCapability,
  assertPermission,
  hasPermission,
  centerGrants,
  AccessDeniedError,
  type PortalActor,
} from '@/domain/access';
import { exportRequestSchema, type ExportRequest } from '@/domain/activity';
import {
  REPORT_COPY_TTL,
  REPORT_DELIVERY_TTL,
  REPORT_ACK_TTL,
  reportRetentionPlan,
  reportIdSchema,
  reportReceiptSchema,
  reportHistoryQuerySchema,
  type ReportReceipt,
  type ReportHistory,
} from '@/domain/report-downloads';
import { getStore } from '@/server/store';
import { PortalError } from '@/server/http';
import { activityContext } from './repository';
import { demoDealer } from '@/server/auth/dealers';

const missing = () =>
  new PortalError(404, 'REPORT_NOT_FOUND', 'This report is unavailable or outside your access.');
const copyMissing = () =>
  new PortalError(
    410,
    'REPORT_COPY_UNAVAILABLE',
    'The saved copy is unavailable. Generate again to use current data and permissions.',
  );
export const reportDigest = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex');
export function consumeReportDownload(actor: PortalActor) {
  assertCapability(actor, 'reports.export');
  if (!getStore().consumeLimit(`report-download:${actor.mode}:${actor.dealerId}`, 30, 60000))
    throw new PortalError(
      429,
      'REPORT_DOWNLOAD_LIMIT',
      'Wait a minute before requesting another workbook.',
    );
}
export function cleanReportCopies(now = Date.now()) {
  const store = getStore();
  store.db
    .prepare(
      "UPDATE report_copies SET data=NULL,sha256=NULL,state='expired' WHERE expires_at<=? AND data IS NOT NULL",
    )
    .run(now);
  store.db
    .prepare('DELETE FROM report_deliveries WHERE requested_at<=?')
    .run(now - REPORT_DELIVERY_TTL);
}
function owned(actor: PortalActor, input: string) {
  assertCapability(actor, 'reports.export');
  const id = reportIdSchema.parse(input);
  const row = getStore()
    .db.prepare(
      'SELECT id,params,state,filename FROM report_exports WHERE id=? AND dealer_id=? AND mode=?',
    )
    .get(id, actor.dealerId, actor.mode);
  if (!row) throw missing();
  return {
    id: String(row.id),
    state: String(row.state),
    filename: row.filename == null ? null : String(row.filename),
    request: exportRequestSchema.parse(JSON.parse(String(row.params))),
  };
}
async function scope(actor: PortalActor, request: ExportRequest) {
  for (const ref of request.centers) {
    assertPermission(actor, 'reports.export', ref);
    await activityContext(actor, ref);
  }
}
// Called in the generation publication transaction after every selected center was reauthorized.
export function retainReportCopy(actor: PortalActor, id: string, buffer: Buffer, now = Date.now()) {
  owned(actor, id);
  const store = getStore();
  cleanReportCopies(now);
  const own = store.db
    .prepare(
      'SELECT export_id,length(data) bytes FROM report_copies WHERE dealer_id=? AND mode=? AND data IS NOT NULL ORDER BY created_at,export_id',
    )
    .all(actor.dealerId, actor.mode)
    .map((row) => ({ id: String(row.export_id), bytes: Number(row.bytes) }));
  const total = Number(
    store.db.prepare('SELECT COALESCE(SUM(length(data)),0) bytes FROM report_copies').get()?.bytes,
  );
  const plan = reportRetentionPlan(own, total, buffer.length);
  for (const evicted of plan.evict)
    store.db
      .prepare(
        "UPDATE report_copies SET data=NULL,sha256=NULL,state='evicted' WHERE export_id=? AND dealer_id=? AND mode=?",
      )
      .run(evicted, actor.dealerId, actor.mode);
  const expiresAt = now + REPORT_COPY_TTL;
  store.db
    .prepare(
      'INSERT INTO report_copies(export_id,dealer_id,mode,data,bytes,sha256,state,created_at,expires_at) VALUES(?,?,?,?,?,?,?,?,?)',
    )
    .run(
      id,
      actor.dealerId,
      actor.mode,
      plan.retained ? buffer : null,
      buffer.length,
      plan.retained ? reportDigest(buffer) : null,
      plan.reason,
      now,
      expiresAt,
    );
  return { retained: plan.retained, expiresAt: plan.retained ? expiresAt : null };
}
// Caller has just rechecked scope. This records response preparation, not browser or disk delivery.
export function reportDeliveryAttempt(
  actor: PortalActor,
  id: string,
  bytes: number,
  now = Date.now(),
) {
  const store = getStore();
  owned(actor, id);
  cleanReportCopies(now);
  const count = Number(
    store.db
      .prepare('SELECT COUNT(*) n FROM report_deliveries WHERE dealer_id=? AND mode=?')
      .get(actor.dealerId, actor.mode)?.n,
  );
  const total = Number(store.db.prepare('SELECT COUNT(*) n FROM report_deliveries').get()?.n);
  if (count >= 5000 || total >= 50000)
    throw new PortalError(
      429,
      'REPORT_RECEIPT_LIMIT',
      'Report download activity limits were reached. Try again later.',
    );
  const attemptId = randomUUID();
  store.db
    .prepare(
      'INSERT INTO report_deliveries(id,export_id,dealer_id,mode,bytes,requested_at,received_at) VALUES(?,?,?,?,?,?,NULL)',
    )
    .run(attemptId, id, actor.dealerId, actor.mode, bytes, now);
  return attemptId;
}
export async function downloadReportCopy(actor: PortalActor, input: string) {
  const row = owned(actor, input),
    id = String(row.id);
  await scope(actor, row.request);
  consumeReportDownload(actor);
  return getStore().transaction(() => {
    cleanReportCopies();
    const artifact = getStore()
      .db.prepare(
        "SELECT data,bytes,sha256,expires_at FROM report_copies WHERE export_id=? AND dealer_id=? AND mode=? AND state='available' AND expires_at>?",
      )
      .get(id, actor.dealerId, actor.mode, Date.now());
    if (row.state !== 'generated' || !artifact?.data || !row.filename) throw copyMissing();
    const buffer = Buffer.from(artifact.data as Uint8Array),
      filename = String(row.filename);
    if (
      buffer.length !== Number(artifact.bytes) ||
      reportDigest(buffer) !== artifact.sha256 ||
      !/^icare-activity-20\d{2}-(0[1-9]|1[0-2])-[a-f0-9]{8}\.xlsx$/.test(filename)
    )
      throw new PortalError(
        410,
        'REPORT_COPY_INVALID',
        'The saved copy could not be verified. Generate a new workbook.',
      );
    return {
      id,
      buffer,
      filename,
      retained: true,
      expiresAt: Number(artifact.expires_at),
      attemptId: reportDeliveryAttempt(actor, id, buffer.length),
    };
  });
}
export async function acknowledgeReport(
  actor: PortalActor,
  input: string,
  value: { attemptId: string; bytes: number },
) {
  const row = owned(actor, input),
    id = String(row.id),
    change = reportReceiptSchema.parse(value);
  if (!getStore().consumeLimit(`report-ack:${actor.mode}:${actor.dealerId}`, 60, 60000))
    throw new PortalError(
      429,
      'REPORT_RECEIPT_LIMIT',
      'Wait a minute before reporting another browser receipt.',
    );
  await scope(actor, row.request);
  return getStore().transaction(() => {
    cleanReportCopies();
    const attempt = getStore()
      .db.prepare(
        'SELECT bytes,requested_at,received_at FROM report_deliveries WHERE id=? AND export_id=? AND dealer_id=? AND mode=?',
      )
      .get(change.attemptId, id, actor.dealerId, actor.mode);
    if (!attempt) throw missing();
    if (Number(attempt.bytes) !== change.bytes)
      throw new PortalError(
        422,
        'REPORT_BYTES_MISMATCH',
        'The reported workbook size does not match this download request.',
      );
    if (attempt.received_at != null) return { receivedAt: Number(attempt.received_at) };
    const now = Date.now();
    if (Number(attempt.requested_at) + REPORT_ACK_TTL <= now)
      throw new PortalError(410, 'REPORT_RECEIPT_EXPIRED', 'This download receipt has expired.');
    getStore()
      .db.prepare('UPDATE report_deliveries SET received_at=? WHERE id=? AND received_at IS NULL')
      .run(now, change.attemptId);
    return { receivedAt: now };
  });
}
export function reportHistoryPage(
  actor: PortalActor,
  input: { page: number } = { page: 1 },
): ReportHistory {
  assertCapability(actor, 'reports.export');
  const { page } = reportHistoryQuerySchema.parse(input),
    store = getStore(),
    pageSize = 20;
  if (actor.mode === 'preview') {
    const current = demoDealer(actor.dealerId);
    if (!current) throw new AccessDeniedError();
    actor = {
      ...actor,
      grants: centerGrants(current.isSuperAdmin, current.ownedKeys, current.reportKeys),
    };
  }
  return store.transaction(() => {
    cleanReportCopies();
    const total = Number(
      store.db
        .prepare('SELECT COUNT(*) n FROM report_exports WHERE dealer_id=? AND mode=?')
        .get(actor.dealerId, actor.mode)?.n,
    );
    const rows = store.db
      .prepare(
        `SELECT e.id,e.params,e.state,e.created_at,e.finished_at,e.filename,c.state copy_state,c.bytes,c.expires_at,
      (SELECT COUNT(*) FROM report_deliveries d WHERE d.export_id=e.id AND d.mode=e.mode AND d.dealer_id=e.dealer_id) requests,
      (SELECT COUNT(*) FROM report_deliveries d WHERE d.export_id=e.id AND d.mode=e.mode AND d.dealer_id=e.dealer_id AND d.received_at IS NOT NULL) receipts,
      (SELECT MAX(requested_at) FROM report_deliveries d WHERE d.export_id=e.id AND d.mode=e.mode AND d.dealer_id=e.dealer_id) last_request,
      (SELECT MAX(received_at) FROM report_deliveries d WHERE d.export_id=e.id AND d.mode=e.mode AND d.dealer_id=e.dealer_id) last_receipt
      FROM report_exports e LEFT JOIN report_copies c ON c.export_id=e.id AND c.dealer_id=e.dealer_id AND c.mode=e.mode WHERE e.dealer_id=? AND e.mode=? ORDER BY e.created_at DESC,e.rowid DESC LIMIT ? OFFSET ?`,
      )
      .all(actor.dealerId, actor.mode, pageSize, (page - 1) * pageSize);
    const items: ReportReceipt[] = rows.map((row) => {
      const request = exportRequestSchema.parse(JSON.parse(String(row.params))),
        state =
          row.state === 'preparing' && Number(row.created_at) < Date.now() - 15 * 60000
            ? 'unconfirmed'
            : (row.state as ReportReceipt['state']);
      const copyState = (row.copy_state ?? 'not-retained') as ReportReceipt['copy']['state'];
      return {
        id: String(row.id),
        state,
        createdAt: Number(row.created_at),
        finishedAt: row.finished_at == null ? null : Number(row.finished_at),
        filename: row.filename == null ? null : String(row.filename),
        request,
        copy: {
          state: copyState,
          bytes: row.bytes == null ? null : Number(row.bytes),
          expiresAt: copyState === 'available' ? Number(row.expires_at) : null,
          canDownload:
            state === 'generated' &&
            copyState === 'available' &&
            request.centers.every((ref) => hasPermission(actor, 'reports.export', ref)),
        },
        delivery: {
          requests: Number(row.requests),
          browserReceipts: Number(row.receipts),
          lastRequestedAt: row.last_request == null ? null : Number(row.last_request),
          lastReceivedAt: row.last_receipt == null ? null : Number(row.last_receipt),
        },
      };
    });
    return { items, total, page, pageSize };
  });
}
