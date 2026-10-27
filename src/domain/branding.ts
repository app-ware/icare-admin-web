import { z } from 'zod';
import { centerRefSchema, type CenterRef } from './centers';
export const IMAGE_MAX_BYTES = 5 * 1024 * 1024;
export const IMAGE_MAX_PIXELS = 16 * 1024 * 1024;
export const IMAGE_MAX_DIMENSION = 8192;
export const IMAGE_OUTPUT_DIMENSION = 1024;
export const BRANDING_STAGE_MS = 24 * 60 * 60_000;
export const BRANDING_RETENTION_MS = 7 * 24 * 60 * 60_000;
export const brandingKindSchema = z.enum(['logo', 'photo']);
export type BrandingKind = z.infer<typeof brandingKindSchema>;
export const brandingRefSchema = centerRefSchema.extend({
  id: z.number().int().positive().max(2147483647),
});
export const brandingPublishSchema = z
  .object({
    revision: z.string().regex(/^[a-f0-9]{64}$/),
    logo: z.uuid().optional(),
    photo: z.uuid().optional(),
  })
  .strict()
  .refine((v) => Boolean(v.logo || v.photo), 'Choose a logo or center photo first.');
export type BrandingPublish = z.infer<typeof brandingPublishSchema>;
export interface BrandingAsset {
  id: string;
  kind: BrandingKind;
  url: string;
  width: number;
  height: number;
  bytes: number;
  mime: 'image/png' | 'image/jpeg';
  createdAt: number;
  expiresAt: number | null;
}
export interface CenterBranding {
  center: CenterRef;
  logo: BrandingAsset | null;
  photo: BrandingAsset | null;
  revision: string;
  canManage: boolean;
  storage: 'portal-private';
}
