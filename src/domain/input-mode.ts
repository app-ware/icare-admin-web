import { z } from 'zod';
import type { CenterRef } from './centers';

export const inputModeId = z.number().int().positive().max(2147483647);
export const inputRevision = z.string().regex(/^[a-f0-9]{64}$/);
export const inputModeChangeSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('override'),
      revision: inputRevision,
      inputType: inputModeId,
      jobId: z.uuid().optional(),
    })
    .strict(),
  z
    .object({ action: z.literal('inherit'), revision: inputRevision, jobId: z.uuid().optional() })
    .strict(),
]);
export const qrStartSchema = z
  .object({ revision: inputRevision, requestId: z.uuid(), useWatermark: z.boolean() })
  .strict();
export const qrActionSchema = z.object({ action: z.enum(['advance', 'retry', 'cancel']) }).strict();
export type InputModeChange = z.infer<typeof inputModeChangeSchema>;
export type QrStart = z.infer<typeof qrStartSchema>;
export type InputChoice = { id: number; label: string; enabled: boolean };
export type InputRow = { id: number; centerId: number; inputType: number | null };
export function resolveInputMode(rows: InputRow[], choices: InputChoice[], centerId: number) {
  const issues: string[] = [];
  if (
    !choices.length ||
    choices.length > 100 ||
    choices.some(
      (c) => !inputModeId.safeParse(c.id).success || !c.label.trim() || c.label.length > 240,
    ) ||
    new Set(choices.map((c) => c.id)).size !== choices.length
  )
    issues.push('Input-mode references are missing, duplicated or invalid.');
  const own = rows.filter((r) => r.centerId === centerId),
    defaults = rows.filter((r) => r.centerId === -1);
  if (
    own.length > 1 ||
    defaults.length > 1 ||
    rows.some(
      (r) =>
        !inputModeId.safeParse(r.id).success ||
        ![centerId, -1].includes(r.centerId) ||
        !choices.some((c) => c.id === r.inputType && c.enabled),
    )
  )
    issues.push('Input-mode settings contain duplicate or invalid rows.');
  const selected = own.length === 1 ? own[0] : defaults.length === 1 ? defaults[0] : null;
  const choice = choices.find((c) => c.id === selected?.inputType);
  if (!selected || !choice?.enabled)
    issues.push('The effective input mode is missing or unavailable.');
  const fallback =
    defaults.length === 1
      ? choices.find((c) => c.id === defaults[0].inputType && c.enabled)
      : undefined;
  return {
    source: own.length ? ('override' as const) : ('inherited' as const),
    inputType: choice?.id ?? null,
    label: choice?.label ?? 'Needs review',
    defaultType: fallback?.id ?? null,
    issues,
  };
}
export type QrJobState = 'pending' | 'running' | 'ready' | 'failed' | 'applied' | 'cancelled';
export type QrJob = {
  id: string;
  state: QrJobState;
  createdAt: number;
  expiresAt: number;
  useWatermark: boolean;
  total: number;
  ready: number;
  failed: number;
  pending: number;
  items: {
    id: string;
    label: string;
    state: 'pending' | 'rendering' | 'ready' | 'failed';
    imageUrl: string | null;
  }[];
};
export type CenterInputMode = ReturnType<typeof resolveInputMode> & {
  center: CenterRef;
  revision: string;
  choices: InputChoice[];
  canChange: boolean;
  canGenerate: boolean;
  mode: 'legacy' | 'preview';
  watermarkAvailable: boolean;
  job: QrJob | null;
};
