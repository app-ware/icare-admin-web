import { z } from 'zod';
import { directoryQuerySchema, type DirectoryQuery } from './management';

export const centerViewFiltersSchema = directoryQuerySchema
  .pick({ q: true, type: true, status: true, sort: true })
  .strict();
export type CenterViewFilters = z.infer<typeof centerViewFiltersSchema>;
const name = z
  .string()
  .max(120)
  .refine((value) => !/[\p{Cc}\p{Cf}]/u.test(value), 'Use a name without control characters.')
  .transform((value) => value.normalize('NFKC').trim().replace(/\s+/gu, ' '))
  .pipe(z.string().min(1).max(60));
export const createCenterViewSchema = z
  .object({ id: z.uuid(), name, filters: centerViewFiltersSchema })
  .strict();
export const updateCenterViewSchema = z
  .object({ revision: z.uuid(), name, filters: centerViewFiltersSchema })
  .strict();
export const centerViewRevisionSchema = z.object({ revision: z.uuid() }).strict();
export const CENTER_VIEW_LIMIT = 20;
export const CENTER_VIEW_ARCHIVE_LIMIT = 20;
export const CENTER_VIEW_ARCHIVE_TTL = 30 * 86400000;
export type SavedCenterView = {
  id: string;
  name: string;
  filters: CenterViewFilters;
  revision: string;
  createdAt: number;
  updatedAt: number;
  removedAt: number | null;
};
export type CenterViews = { items: SavedCenterView[]; removed: SavedCenterView[] };
export function centerViewFilters(query: DirectoryQuery): CenterViewFilters {
  return centerViewFiltersSchema.parse({
    q: query.q,
    type: query.type,
    status: query.status,
    sort: query.sort,
  });
}
export function sameCenterViewFilters(a: CenterViewFilters, b: CenterViewFilters) {
  return a.q === b.q && a.type === b.type && a.status === b.status && a.sort === b.sort;
}
