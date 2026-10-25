import { z } from 'zod';
import { statusRefSchema, statusState } from './status';
import type { CenterRef } from './centers';

export const alertQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    type: z.enum(['all', '1', '3', '4']).default('all'),
    activation: z.enum(['all', 'active', 'inactive', 'unknown', 'review']).default('all'),
    state: z.enum(['all', 'current', 'expired', 'none', 'review']).default('all'),
    dealerId: z.coerce.number().int().positive().max(2147483647).optional(),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const calendarDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Choose a valid expiry date.')
  .refine((v) => {
    const date = new Date(`${v}T00:00:00.000Z`);
    return (
      v >= '0001-01-01' && Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === v
    );
  }, 'Choose a valid calendar date.');
export const alertTargetSchema = statusRefSchema
  .extend({ revision: z.string().regex(/^[a-f0-9]{64}$/) })
  .strict();
const targets = z
  .array(alertTargetSchema)
  .min(1, 'Select at least one center.')
  .max(10, 'Select up to 10 centers per batch.')
  .refine(
    (v) => new Set(v.map((c) => `${c.id}_${c.type}`)).size === v.length,
    'Select each center once.',
  );
export const alertBatchSchema = z.discriminatedUnion('action', [
  z
    .object({
      id: z.uuid(),
      action: z.literal('publish'),
      targets,
      message: z
        .string()
        .trim()
        .min(1, 'Enter an alert message.')
        .max(250, 'Use at most 250 characters.')
        .refine(
          (v) => !/[<>\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v),
          'Use plain text without angle brackets or control characters.',
        ),
      expiryDate: calendarDate,
    })
    .strict(),
  z.object({ id: z.uuid(), action: z.literal('reset'), targets }).strict(),
]);
export const alertRetrySchema = z.object({ retry: z.literal(true) }).strict();
export type AlertBatchInput = z.infer<typeof alertBatchSchema>;
export type AlertQuery = z.infer<typeof alertQuerySchema>;
export type AlertState = 'none' | 'current' | 'expired' | 'review';
export function alertState(
  message: string | null,
  expiryDate: string | null,
  count: number,
  today: string,
): AlertState {
  if (count === 0) return 'none';
  if (count !== 1 || !message?.trim() || !expiryDate || !calendarDate.safeParse(expiryDate).success)
    return 'review';
  return expiryDate < today ? 'expired' : 'current';
}
export const utcToday = () => new Date().toISOString().slice(0, 10);
export const activationLabel = (code: number | null, count: number) => statusState(code, count);
export interface AlertCenter extends CenterRef {
  name: string;
  domain: string;
  activation: ReturnType<typeof statusState>;
  message: string | null;
  expiryDate: string | null;
  state: AlertState;
  revision: string;
  updatedAt: string | null;
  canPublish: boolean;
  canReset: boolean;
}
export interface AlertDirectory {
  items: AlertCenter[];
  total: number;
  page: number;
  pageSize: number;
  today: string;
  writesEnabled: boolean;
  canReset: boolean;
  canFilterDealer: boolean;
  dealers: { id: number; name: string }[];
}
export type AlertTargetState = 'pending' | 'working' | 'succeeded' | 'failed' | 'unconfirmed';
export interface AlertBatchResult {
  id: string;
  action: 'publish' | 'reset';
  message?: string;
  expiryDate?: string;
  running: boolean;
  expiresAt: number;
  targets: (CenterRef & {
    state: AlertTargetState;
    code: string | null;
    message: string | null;
    retryable: boolean;
    attempts: number;
  })[];
}
