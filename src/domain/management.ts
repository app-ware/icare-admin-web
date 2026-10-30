import { z } from 'zod';
import { coordinatesSchema, centerRefSchema } from './centers';
import type { BrandingAsset, BrandingKind } from './branding';

export const profileSchema = z
  .object({
    name: z.string().trim().min(2, 'Enter a center name.').max(160),
    manager: z.string().trim().max(120),
    email: z.union([z.email(), z.literal('')]),
    mobile: z.string().trim().max(40),
    landline: z.string().trim().max(40),
    website: z
      .string()
      .trim()
      .max(250)
      .refine(
        (v) => !v || (/^https?:\/\//i.test(v) && URL.canParse(v)),
        'Use a full http:// or https:// address.',
      ),
    address: z.string().trim().max(400),
    description: z.string().trim().max(2000),
    location: coordinatesSchema.nullable(),
  })
  .strict();
export type CenterProfile = z.infer<typeof profileSchema>;
export const draftSchema = z
  .object({
    type: centerRefSchema.shape.type,
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]{2,50}$/, 'Use 2–50 letters or numbers.'),
    profile: profileSchema,
    branding: z
      .object({
        logo: z.uuid().optional(),
        photo: z.uuid().optional(),
        watermark: z.uuid().nullable().optional(),
      })
      .strict()
      .optional(),
  })
  .strict();
export type CenterDraftData = z.infer<typeof draftSchema>;
export const profileUpdateSchema = z
  .object({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    profile: profileSchema,
  })
  .strict();
export const directoryQuerySchema = z.object({
  q: z.string().trim().max(120).default(''),
  type: z.enum(['all', '1', '3', '4']).default('all'),
  status: z.enum(['all', 'active', 'inactive', 'unknown']).default('all'),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  sort: z.enum(['name', 'name-desc', 'type']).default('name'),
});
export type DirectoryQuery = z.infer<typeof directoryQuerySchema>;
export interface ManagedCenter {
  id: number;
  type: 1 | 3 | 4;
  domain: string;
  profile: CenterProfile;
  active: boolean | null;
  revision: string;
  timeZone: string | null;
  canEdit: boolean;
  invalidLocation?: boolean;
}
export interface DirectoryResult {
  items: ManagedCenter[];
  total: number;
  page: number;
  pageSize: number;
}
export interface SavedDraft {
  id: string;
  data: CenterDraftData;
  revision: number;
  updatedAt: number;
  published: { id: number; type: 1 | 3 | 4 } | null;
  branding: Record<BrandingKind, BrandingAsset | null>;
}
export const emptyProfile: CenterProfile = {
  name: '',
  manager: '',
  email: '',
  mobile: '',
  landline: '',
  website: '',
  address: '',
  description: '',
  location: null,
};
