import { z } from 'zod';
import { centerRefSchema, type CenterRef } from './centers';

const sqlId = z.number().int().positive().max(2147483647);
export const transportRefSchema = centerRefSchema.extend({ id: sqlId });
export const busIdSchema = z.coerce.number().int().positive().max(2147483647);
export const transportQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    type: z.enum(['all', '1', '3', '4']).default('all'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export const busChangeSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('override'),
      revision: z.string().regex(/^[a-f0-9]{64}$/),
      radius: sqlId,
      dwell: sqlId,
      input: sqlId,
    })
    .strict(),
  z.object({ action: z.literal('inherit'), revision: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
]);
export type BusChange = z.infer<typeof busChangeSchema>;
export type TransportQuery = z.infer<typeof transportQuerySchema>;
export interface BusValues {
  radius: number | null;
  dwell: number | null;
  input: number | null;
}
export interface BusOption {
  id: number;
  label: string;
  value: number | null;
}
export interface BusReferences {
  radius: BusOption[];
  dwell: BusOption[];
  input: BusOption[];
}
export interface BusRow extends BusValues {
  id: number;
  busId: number;
}
export interface TransportCenter extends CenterRef {
  name: string;
}
export interface TransportDirectory {
  items: TransportCenter[];
  total: number;
  page: number;
  pageSize: number;
  writesEnabled: boolean;
}
export interface CenterBuses {
  center: TransportCenter;
  items: { id: number; name: string }[];
  writesEnabled: boolean;
}
export interface BusDetail {
  center: TransportCenter;
  bus: { id: number; name: string };
  source: 'override' | 'inherited' | 'missing';
  values: BusValues | null;
  defaults: BusValues | null;
  references: BusReferences;
  issues: string[];
  revision: string;
  canManage: boolean;
  canInherit: boolean;
}
export function referencesValid(refs: BusReferences): boolean {
  if ([...refs.radius, ...refs.dwell].some((o) => o.value === null)) return false;
  return (Object.values(refs) as BusOption[][]).every(
    (options) =>
      options.length > 0 &&
      options.length <= 100 &&
      new Set(options.map((o) => o.id)).size === options.length &&
      options.every(
        (o) =>
          Number.isInteger(o.id) &&
          o.id > 0 &&
          o.id <= 2147483647 &&
          Boolean(o.label.trim()) &&
          o.label.length <= 250 &&
          (o.value === null || (Number.isInteger(o.value) && o.value >= 0)),
      ),
  );
}
export function valuesValid(values: BusValues | null, refs: BusReferences): boolean {
  return Boolean(
    values &&
    (['radius', 'dwell', 'input'] as const).every((k) => refs[k].some((o) => o.id === values[k])),
  );
}
export function resolveBusSettings(rows: BusRow[], busId: number, refs: BusReferences) {
  const own = rows.filter((r) => r.busId === busId),
    defaults = rows.filter((r) => r.busId === -1);
  const source = own.length ? 'override' : defaults.length ? 'inherited' : 'missing';
  const selected = own.length ? own : defaults;
  const values =
    selected.length === 1
      ? { radius: selected[0].radius, dwell: selected[0].dwell, input: selected[0].input }
      : null;
  const defaultValues =
    defaults.length === 1
      ? { radius: defaults[0].radius, dwell: defaults[0].dwell, input: defaults[0].input }
      : null;
  const issues: string[] = [];
  if (!referencesValid(refs)) issues.push('Reference choices are missing or need review.');
  if (selected.length > 1) issues.push('Duplicate settings need review before editing.');
  if (selected.length === 1 && !valuesValid(values, refs))
    issues.push('Stored settings do not match the available choices.');
  return {
    source: source as BusDetail['source'],
    values,
    defaults: defaultValues,
    issues,
    canInherit:
      own.length === 1 &&
      defaults.length === 1 &&
      referencesValid(refs) &&
      valuesValid(defaultValues, refs),
  };
}
