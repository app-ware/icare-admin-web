import { z } from 'zod';

export const centerTypes = [1, 3, 4] as const;
export type CenterType = (typeof centerTypes)[number];
export const centerTypeLabels: Record<CenterType, string> = {
  1: 'Nursery',
  3: 'Lite',
  4: 'School',
};
export const centerRefSchema = z
  .object({
    id: z.number().int().positive(),
    type: z.union([z.literal(1), z.literal(3), z.literal(4)]),
  })
  .strict();
export type CenterRef = z.infer<typeof centerRefSchema>;
export const centerKey = (ref: CenterRef) => {
  const valid = centerRefSchema.parse({ id: ref.id, type: ref.type });
  return `${valid.id}_${valid.type}`;
};
export function operationalDatabase(type: CenterType): 'school' | 'nursery' {
  if (type === 4) return 'school';
  if (type === 1 || type === 3) return 'nursery';
  throw new Error('Unsupported center type');
}
export const coordinatesSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();
export type Coordinates = z.infer<typeof coordinatesSchema>;
export function parseLegacyLocation(value: string): Coordinates {
  const parts = value.split(',').map((part) => part.trim());
  const numeric = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/;
  if (parts.length !== 2 || parts.some((part) => !numeric.test(part)))
    throw new Error('Invalid legacy location');
  return coordinatesSchema.parse({ longitude: Number(parts[0]), latitude: Number(parts[1]) });
}
export function serializeLegacyLocation(value: Coordinates): string {
  const valid = coordinatesSchema.parse(value);
  return `${valid.longitude},${valid.latitude}`;
}
export const decimalAmountSchema = z
  .string()
  .regex(/^\d+(?:\.\d{1,4})?$/, 'Use a nonnegative decimal amount with up to four decimal places');
// Four places is a provisional transport limit, not an approved currency/SQL precision policy.
export const centerDraftSchema = z
  .object({
    name: z.string().trim().min(2).max(160),
    domain: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9]{2,50}$/, 'Use 2–50 letters or numbers'),
    manager: z.string().trim().min(2).max(120),
    email: z.email(),
    type: z.union([z.literal(1), z.literal(3), z.literal(4)]),
  })
  .strict();
export type CenterDraft = z.infer<typeof centerDraftSchema>;
export interface Center extends CenterRef, CenterDraft {
  dealer: string;
  city: string;
  active: boolean;
  gatewayConfigured: boolean;
  brandingReady: boolean;
}
