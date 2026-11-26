import { z } from 'zod';
import type { ExportRequest } from './activity';

export const REPORT_COPY_TTL = 7 * 86400000;
export const REPORT_DELIVERY_TTL = 30 * 86400000;
export const REPORT_ACK_TTL = 86400000;
export const REPORT_COPY_MAX_BYTES = 10 * 1024 * 1024;
export const REPORT_COPY_ACTOR_BYTES = 64 * 1024 * 1024;
export const REPORT_COPY_GLOBAL_BYTES = 256 * 1024 * 1024;
export const REPORT_COPY_COUNT = 20;
export const reportIdSchema = z.uuid();
export const reportHistoryQuerySchema = z
  .object({ page: z.coerce.number().int().min(1).max(100000).default(1) })
  .strict();
export const reportReceiptSchema = z
  .object({
    attemptId: z.uuid(),
    bytes: z
      .number()
      .int()
      .positive()
      .max(50 * 1024 * 1024),
  })
  .strict();
export type ReportCopyState =
  'available' | 'expired' | 'evicted' | 'capacity' | 'size' | 'not-retained';
export type ReportReceipt = {
  id: string;
  state: 'preparing' | 'generated' | 'failed' | 'unconfirmed';
  createdAt: number;
  finishedAt: number | null;
  filename: string | null;
  request: ExportRequest;
  copy: {
    state: ReportCopyState;
    bytes: number | null;
    expiresAt: number | null;
    canDownload: boolean;
  };
  delivery: {
    requests: number;
    browserReceipts: number;
    lastRequestedAt: number | null;
    lastReceivedAt: number | null;
  };
};
export type ReportHistory = {
  items: ReportReceipt[];
  total: number;
  page: number;
  pageSize: number;
};
export type RetainedFile = { id: string; bytes: number };
// Oldest own files first. Never evict another actor/mode, or evict anything for a failed new save.
export function reportRetentionPlan(
  own: RetainedFile[],
  globalBytes: number,
  incomingBytes: number,
) {
  if (incomingBytes > REPORT_COPY_MAX_BYTES)
    return { retained: false, reason: 'size' as const, evict: [] as string[] };
  let ownBytes = own.reduce((sum, item) => sum + item.bytes, 0),
    count = own.length,
    total = globalBytes;
  const evict: string[] = [];
  for (const item of own) {
    if (
      count < REPORT_COPY_COUNT &&
      ownBytes + incomingBytes <= REPORT_COPY_ACTOR_BYTES &&
      total + incomingBytes <= REPORT_COPY_GLOBAL_BYTES
    )
      break;
    evict.push(item.id);
    ownBytes -= item.bytes;
    total -= item.bytes;
    count--;
  }
  const retained =
    count < REPORT_COPY_COUNT &&
    ownBytes + incomingBytes <= REPORT_COPY_ACTOR_BYTES &&
    total + incomingBytes <= REPORT_COPY_GLOBAL_BYTES;
  return {
    retained,
    reason: retained ? ('available' as const) : ('capacity' as const),
    evict: retained ? evict : [],
  };
}
