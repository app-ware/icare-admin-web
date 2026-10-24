import { z } from 'zod';
import type { CenterRef } from './centers';

export const centerUserQuerySchema = z.object({
  centerId: z.coerce.number().int().positive().max(2147483647),
  centerType: z.coerce.number().pipe(z.union([z.literal(1), z.literal(3), z.literal(4)])),
  q: z.string().trim().max(100).default(''),
  status: z.enum(['all', 'enabled', 'disabled', 'unknown']).default('all'),
  role: z.enum(['all', 'admin', 'staff', 'review']).default('all'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export const centerUserKeySchema = z
  .string()
  .regex(/^[ls]_(?:0|[1-9]\d{0,9})$/)
  .refine((key) => Number(key.slice(2)) <= 2147483647);
export const centerUserUpdateSchema = z
  .object({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    firstName: z.string().trim().max(50),
    lastName: z.string().trim().max(50),
    email: z.union([z.email().max(50), z.literal('')]),
    active: z.boolean().nullable(),
  })
  .strict();
export type CenterUserQuery = z.infer<typeof centerUserQuerySchema>;
export type CenterUserUpdate = z.infer<typeof centerUserUpdateSchema>;
export type UserMappingIssue =
  | 'missing_local'
  | 'multiple_secure'
  | 'shared_local'
  | 'duplicate_username'
  | 'missing_username'
  | 'protected_account';
export const mappingIssueLabels: Record<UserMappingIssue, string> = {
  missing_local: 'The local account is missing or belongs to a different center.',
  multiple_secure: 'More than one secure account maps to this local user.',
  shared_local: 'This local user is shared with another center or has conflicting center links.',
  duplicate_username: 'This sign-in username is used by more than one secure account.',
  missing_username: 'The secure sign-in username is missing.',
  protected_account: 'Only a portal administrator can edit this protected account.',
};
export interface CenterUser {
  key: string;
  localId: number | null;
  secureId: number | null;
  username: string;
  localUsername: string;
  firstName: string;
  lastName: string;
  email: string;
  active: boolean | null;
  isAdmin: boolean | null;
  isSuperAdmin: boolean;
  mapping: 'linked' | 'local' | 'review';
  issues: UserMappingIssue[];
  roles: string[];
  revision: string;
  canEdit: boolean;
  canChangeSignIn: boolean;
}
export interface CenterUserDirectory {
  center: CenterRef & { name: string };
  items: CenterUser[];
  total: number;
  page: number;
  pageSize: number;
  enabledCount: number;
  adminCount: number;
  reviewCount: number;
}
export class CenterUserPolicyError extends Error {
  constructor(public code: 'MAPPING_REVIEW' | 'STATUS_UNAVAILABLE' | 'LAST_CENTER_ADMIN') {
    super(code);
  }
}
export function assertCenterUserUpdate(
  current: CenterUser,
  next: CenterUserUpdate,
  activeAdmins: number,
) {
  if (current.issues.length || current.localId === null)
    throw new CenterUserPolicyError('MAPPING_REVIEW');
  if (
    (current.secureId === null && next.active !== null) ||
    (current.active !== null && next.active === null)
  )
    throw new CenterUserPolicyError('STATUS_UNAVAILABLE');
  if (
    current.active === true &&
    (current.isAdmin || current.isSuperAdmin) &&
    next.active === false &&
    activeAdmins <= 1
  )
    throw new CenterUserPolicyError('LAST_CENTER_ADMIN');
}
