import { z } from 'zod';
import { centerRefSchema, type CenterRef } from './centers';

// Audited legacy App_Code/enums.vb: CenterStatus.Active=1, Inactive=0.
export const statusChangeSchema = z
  .object({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    active: z.boolean(),
    reason: z
      .string()
      .trim()
      .min(5, 'Enter a reason of at least 5 characters.')
      .max(500)
      .refine((v) => !/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(v), 'Use plain text.'),
  })
  .strict();
export const statusRefSchema = centerRefSchema.extend({
  id: z.number().int().positive().max(2147483647),
});
export const statusQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    type: z.enum(['all', '1', '3', '4']).default('all'),
    status: z.enum(['all', 'active', 'inactive', 'unknown', 'review']).default('all'),
    dealerId: z.coerce.number().int().positive().max(2147483647).optional(),
    sort: z.enum(['name', 'name-desc', 'type']).default('name'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export type StatusChange = z.infer<typeof statusChangeSchema>;
export type StatusQuery = z.infer<typeof statusQuerySchema>;
export type StatusState = 'active' | 'inactive' | 'unknown' | 'review';
export function statusState(code: number | null, records: number): StatusState {
  if (records === 0) return 'unknown';
  if (records !== 1 || (code !== 0 && code !== 1)) return 'review';
  return code === 1 ? 'active' : 'inactive';
}
export interface CenterStatus extends CenterRef {
  name: string;
  domain: string;
  code: number | null;
  state: StatusState;
  revision: string;
  updatedAt: string | null;
  canManage: boolean;
}
export interface StatusHistory {
  id: string;
  actor: string;
  previousCode: number | null;
  nextCode: number;
  reason: string;
  state: 'preparing' | 'committed' | 'failed' | 'unconfirmed';
  createdAt: number;
}
export interface StatusDetail {
  center: CenterStatus;
  history: StatusHistory[];
  historyAvailable: boolean;
}
export interface StatusDirectory {
  items: CenterStatus[];
  total: number;
  page: number;
  pageSize: number;
  canFilterDealer: boolean;
  dealers: { id: number; name: string }[];
  writesEnabled: boolean;
}
