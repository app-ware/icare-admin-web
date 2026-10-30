import { z } from 'zod';
import { centerRefSchema, type CenterRef } from './centers';

export const cowpayRefSchema = centerRefSchema
  .extend({ type: z.union([z.literal(1), z.literal(3)]) })
  .strict();
export const cowpayQuerySchema = z
  .object({
    q: z.string().trim().max(120).default(''),
    type: z.enum(['all', '1', '3']).default('all'),
    setup: z.enum(['all', 'complete', 'incomplete', 'unconfigured', 'review']).default('all'),
    enabled: z.enum(['all', 'enabled', 'disabled', 'unknown']).default('all'),
    sort: z.enum(['name', 'name-desc', 'type']).default('name'),
    page: z.coerce.number().int().min(1).max(100000).default(1),
  })
  .strict();
export type CowpayQuery = z.infer<typeof cowpayQuerySchema>;
export function parseCowpayQuery(params: URLSearchParams): CowpayQuery {
  if (new Set(params.keys()).size !== [...params.keys()].length)
    throw new z.ZodError([{ code: 'custom', path: [], message: 'Use each filter once.' }]);
  return cowpayQuerySchema.parse(Object.fromEntries(params));
}
export type CowpayPresence = {
  merchantCode: boolean | null;
  merchantHash: boolean | null;
  liveToken: boolean | null;
  stagingToken: boolean | null;
};
// SQL returns aggregate presence only, never credential values or credential-derived fingerprints.
export type CowpayObservation = {
  rowCount: number;
  typeMismatch: number;
  enabledKnown: number;
  enabledValue: number | null;
  merchantCode: number;
  merchantHash: number;
  liveToken: number;
  stagingToken: number;
  updatedAt: string | null;
};
export type CowpayState = {
  setup: 'complete' | 'incomplete' | 'unconfigured' | 'review';
  configured: boolean | null;
  storedEnabled: boolean | null;
  credentials: CowpayPresence;
  liveComplete: boolean;
  stagingComplete: boolean;
  updatedAt: string | null;
  issues: string[];
};
export function cowpayState(row: CowpayObservation): CowpayState {
  const issues: string[] = [];
  const countValid = Number.isInteger(row.rowCount) && row.rowCount >= 0;
  const structure = countValid && row.rowCount === 1 && row.typeMismatch === 0;
  const bitsValid = [row.merchantCode, row.merchantHash, row.liveToken, row.stagingToken].every(
    (v) => v === 0 || v === 1,
  );
  if (!countValid || row.rowCount > 1)
    issues.push('Multiple or invalid settings rows need review.');
  if (row.rowCount > 0 && row.typeMismatch !== 0)
    issues.push('The stored center type does not match this center.');
  if (structure && !bitsValid) issues.push('Stored credential presence needs review.');
  const usable = structure && bitsValid;
  const credentials: CowpayPresence =
    row.rowCount === 0
      ? { merchantCode: false, merchantHash: false, liveToken: false, stagingToken: false }
      : {
          merchantCode: usable ? row.merchantCode === 1 : null,
          merchantHash: usable ? row.merchantHash === 1 : null,
          liveToken: usable ? row.liveToken === 1 : null,
          stagingToken: usable ? row.stagingToken === 1 : null,
        };
  const storedEnabled =
    usable && row.enabledKnown === 1 && [0, 1].includes(row.enabledValue!)
      ? row.enabledValue === 1
      : null;
  if (usable && storedEnabled === null) issues.push('Stored enablement is unknown.');
  const common = credentials.merchantCode === true && credentials.merchantHash === true;
  const liveComplete = common && credentials.liveToken === true,
    stagingComplete = common && credentials.stagingToken === true;
  const validTime =
    row.updatedAt && Number.isFinite(Date.parse(row.updatedAt)) ? row.updatedAt : null;
  return {
    setup: issues.length
      ? 'review'
      : row.rowCount === 0
        ? 'unconfigured'
        : liveComplete || stagingComplete
          ? 'complete'
          : 'incomplete',
    configured: row.rowCount === 0 ? false : usable ? true : null,
    storedEnabled,
    credentials,
    liveComplete,
    stagingComplete,
    updatedAt: usable ? validTime : null,
    issues,
  };
}
export type CowpayCenter = CenterRef & { name: string };
export type CowpaySummary = { center: CowpayCenter } & CowpayState;
export type CowpayCallback = { state: 'pending' | 'reviewed' | 'invalid'; url: string | null };
export type CowpayDetail = CowpaySummary & {
  mode: 'legacy' | 'preview';
  callback: CowpayCallback;
  readOnly: true;
};
export type CowpayDirectory = {
  items: CowpaySummary[];
  total: number;
  page: number;
  pageSize: number;
  summary: { liveComplete: number; stagingComplete: number; enabled: number; review: number };
  mode: 'legacy' | 'preview';
  readOnly: true;
};
