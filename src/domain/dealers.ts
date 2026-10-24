import { z } from 'zod';
import { centerKey, centerRefSchema, type CenterRef } from './centers';

const accountFields = {
  name: z.string().trim().min(2, 'Enter at least two characters.').max(160),
  email: z.union([z.email().max(200), z.literal('')]),
  active: z.boolean(),
  isSuperAdmin: z.boolean(),
  centers: z
    .array(centerRefSchema)
    .max(500)
    .refine(
      (rows) => rows.every((row) => row.id <= 2147483647),
      'Center IDs must fit the database integer range.',
    )
    .refine(
      (rows) => new Set(rows.map(centerKey)).size === rows.length,
      'Select each center only once.',
    ),
};
export const dealerCreateSchema = z
  .object({
    ...accountFields,
    username: z
      .string()
      .trim()
      .min(3)
      .max(100)
      .regex(/^[\p{L}\p{N}._@+-]+$/u, 'Use letters, numbers, dots, underscores, @, + or hyphens.'),
    password: z.string().min(12, 'Use at least 12 characters.').max(128),
  })
  .strict();
export const dealerUpdateSchema = z
  .object({
    ...accountFields,
    revision: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const dealerQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'active', 'inactive']).default('all'),
  role: z.enum(['all', 'admin', 'dealer']).default('all'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export const centerOptionQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export type DealerCreate = z.infer<typeof dealerCreateSchema>;
export type DealerUpdate = z.infer<typeof dealerUpdateSchema>;
export type DealerQuery = z.infer<typeof dealerQuerySchema>;
export interface CenterOption extends CenterRef {
  name: string;
  available: boolean;
}
export interface DealerSummary {
  id: number;
  name: string;
  username: string;
  email: string;
  active: boolean;
  isSuperAdmin: boolean;
  centerCount: number;
  createdDate: string;
}
export interface DealerDetail extends DealerSummary {
  revision: string;
  centers: CenterOption[];
  unsupportedAssignments: number;
}
export interface DealerDirectory {
  items: DealerSummary[];
  total: number;
  page: number;
  pageSize: number;
  activeCount: number;
  adminCount: number;
}
export class DealerPolicyError extends Error {
  constructor(public code: 'SELF_LOCKOUT' | 'LAST_ADMIN') {
    super(code);
  }
}
export function assertDealerLifecycle(
  actorId: number,
  target: Pick<DealerSummary, 'id' | 'active' | 'isSuperAdmin'>,
  next: Pick<DealerUpdate, 'active' | 'isSuperAdmin'>,
  activeAdministrators: number,
) {
  if (actorId === target.id && (!next.active || !next.isSuperAdmin))
    throw new DealerPolicyError('SELF_LOCKOUT');
  if (
    target.active &&
    target.isSuperAdmin &&
    (!next.active || !next.isSuperAdmin) &&
    activeAdministrators <= 1
  )
    throw new DealerPolicyError('LAST_ADMIN');
}
