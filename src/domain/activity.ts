import { z } from 'zod';
import { centerRefSchema, type CenterRef } from './centers';
export const ACTIVITY_POLICY = 'activation-calendar-v1';
export const reportRules = [
  'Activation history, not attendance or an invoice.',
  'Buckets follow the legacy Excel rules: 1–5, 6–13 and 14+ days. Zero is separate.',
  'The ending calendar date is exclusive, matching legacy DateDiff. Today/month-end is not counted.',
  'No activation history means the full interval, even for a recently created record.',
  'Membership and demo flags are current snapshots, not historical rosters.',
  'Nursery/Lite support Add, Activate, Deactivate, Delete and normalized Restore; Move is excluded.',
  'School requires an academic year, excludes deleted records and uses Add/Activate/Deactivate only.',
  'Conflicting timestamps, invalid dates or history in another center are unresolved, not zero.',
];
export const periodSchema = z.string().regex(/^(20\d{2})-(0[1-9]|1[0-2])$/);
export const activityQuerySchema = z
  .object({
    centerId: z.coerce.number().int().positive().max(2147483647),
    centerType: z.coerce.number().pipe(z.union([z.literal(1), z.literal(3), z.literal(4)])),
    period: periodSchema,
    academicYearId: z.coerce.number().int().positive().max(2147483647).optional(),
    includeDeleted: z.enum(['true', 'false']).default('true'),
  })
  .superRefine((v, c) => {
    if (v.centerType === 4 && !v.academicYearId)
      c.addIssue({
        code: 'custom',
        path: ['academicYearId'],
        message: 'Select a school academic year.',
      });
    if (v.centerType !== 4 && v.academicYearId)
      c.addIssue({
        code: 'custom',
        path: ['academicYearId'],
        message: 'Academic year applies only to School.',
      });
    if (v.centerType === 4 && v.includeDeleted === 'true')
      c.addIssue({
        code: 'custom',
        path: ['includeDeleted'],
        message: 'School reports exclude deleted records.',
      });
  });
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export const reportCenterQuerySchema = z.object({
  q: z.string().trim().max(100).default(''),
  type: z.enum(['all', '1', '3', '4']).default('all'),
  status: z.enum(['all', 'active', 'inactive', 'unknown']).default('all'),
  dealerId: z.coerce.number().int().positive().max(2147483647).optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export const exportRequestSchema = z
  .object({
    period: periodSchema,
    includeDeleted: z.boolean(),
    centers: z
      .array(centerRefSchema.extend({ id: z.number().int().positive().max(2147483647) }))
      .min(1)
      .max(20)
      .refine(
        (rows) => new Set(rows.map((r) => `${r.id}_${r.type}`)).size === rows.length,
        'Select each center once.',
      ),
    academicYearId: z.number().int().positive().max(2147483647).optional(),
  })
  .strict()
  .superRefine((v, c) => {
    if (
      v.centers.some((r) => r.type === 4) &&
      (v.centers.length !== 1 || !v.academicYearId || v.includeDeleted)
    )
      c.addIssue({
        code: 'custom',
        path: ['centers'],
        message: 'Export School separately with an academic year and deleted records excluded.',
      });
    if (!v.centers.some((r) => r.type === 4) && v.academicYearId)
      c.addIssue({
        code: 'custom',
        path: ['academicYearId'],
        message: 'Academic year applies only to School.',
      });
  });
export type ExportRequest = z.infer<typeof exportRequestSchema>;
export interface ActivityCenter extends CenterRef {
  name: string;
  domain: string;
  active: boolean | null;
}
export interface Buckets {
  registered: number;
  zero: number;
  short: number;
  medium: number;
  long: number;
  unresolved: number;
}
export interface ClassActivity {
  id: number;
  name: string;
  all: Buckets;
  demo: Buckets;
  nonDemo: Buckets;
}
export interface ActivityReport {
  center: ActivityCenter;
  period: string;
  academicYear: { id: number; title: string } | null;
  includeDeleted: boolean;
  policy: string;
  asOf: string;
  start: string;
  endExclusive: string;
  maxDays: number;
  totals: { all: Buckets; demo: Buckets; nonDemo: Buckets };
  classes: ClassActivity[];
  quality: {
    assumedFull: number;
    futureEvents: number;
    conflictingHistory: number;
    outsideHistory: number;
    invalidHistory: number;
    centerlessEvents: number;
    duplicateEnrollments: number;
    overlappingStudents: number;
  };
}
export interface Member {
  classId: number;
  childId: number;
  demo: boolean;
  duplicates?: number;
  outsideHistory?: boolean;
  invalidHistory?: boolean;
}
export interface ActivationEvent {
  childId: number;
  id: number;
  stamp: string;
  code: number;
  restoreActive: boolean | null;
  centerless?: boolean;
}
export function reportWindow(period: string, asOf: string) {
  periodSchema.parse(period);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(asOf) || period > asOf.slice(0, 7))
    throw new Error('FUTURE_PERIOD');
  const [year, month] = period.split('-').map(Number);
  const last = `${period}-${new Date(Date.UTC(year, month, 0)).getUTCDate().toString().padStart(2, '0')}`;
  const start = `${period}-01`,
    end = asOf < last ? asOf : last;
  return { start, end, maxDays: dayDiff(start, end) };
}
const dayDiff = (start: string, end: string) =>
  Math.round((Date.parse(end + 'T00:00:00Z') - Date.parse(start + 'T00:00:00Z')) / 86400000);
function normalize(event: ActivationEvent, type: CenterRef['type']): number | null {
  if (type === 4) return [1, 2].includes(event.code) ? 2 : event.code === 3 ? 3 : null;
  if (event.code === 6) return event.restoreActive === false ? 3 : 2;
  return [1, 2].includes(event.code) ? 2 : [3, 5].includes(event.code) ? 3 : null;
}
export function calculateActivity(
  events: ActivationEvent[],
  period: string,
  asOf: string,
  type: CenterRef['type'],
) {
  const window = reportWindow(period, asOf);
  let future = 0;
  const normalized = events.flatMap((e) => {
    const code = normalize(e, type);
    if (code === null) return [];
    const day = e.stamp.slice(0, 10);
    if (day >= period + '-01' && day.slice(0, 7) !== period) return [];
    if (day > window.end) {
      future++;
      return [];
    }
    return [{ stamp: e.stamp, day, code }];
  });
  const prior = normalized
    .filter((e) => e.day < window.start)
    .sort((a, b) => b.stamp.localeCompare(a.stamp));
  const latest = prior[0]?.stamp;
  const used = [
    ...prior.filter((e) => e.stamp === latest),
    ...normalized.filter((e) => e.day >= window.start),
  ].sort((a, b) => a.stamp.localeCompare(b.stamp));
  const stamps = new Map<string, number>();
  for (const e of used) {
    if (stamps.has(e.stamp) && stamps.get(e.stamp) !== e.code)
      return { days: null, future, conflict: true, assumed: false };
    stamps.set(e.stamp, e.code);
  }
  const unique = used.filter((e, i) => i === 0 || e.stamp !== used[i - 1].stamp);
  if (!unique.length) return { days: window.maxDays, future, conflict: false, assumed: true };
  const inMonth = unique.filter((e) => e.day >= window.start);
  const before = unique.find((e) => e.day < window.start);
  let active = before
    ? ![3, 5].includes(before.code)
    : inMonth.length
      ? [3, 5].includes(inMonth[0].code)
      : true;
  let cursor = window.start,
    days = 0;
  for (const e of inMonth) {
    if (active) days += dayDiff(cursor, e.day);
    active = ![3, 5].includes(e.code);
    cursor = e.day;
  }
  if (active) days += dayDiff(cursor, window.end);
  return {
    days: days >= 0 && days <= window.maxDays ? days : null,
    future,
    conflict: false,
    assumed: false,
  };
}
export const emptyBuckets = (): Buckets => ({
  registered: 0,
  zero: 0,
  short: 0,
  medium: 0,
  long: 0,
  unresolved: 0,
});
function add(b: Buckets, days: number | null) {
  b.registered++;
  if (days === null) b.unresolved++;
  else if (days === 0) b.zero++;
  else if (days <= 5) b.short++;
  else if (days <= 13) b.medium++;
  else b.long++;
}
const subtract = (all: Buckets, demo: Buckets) =>
  Object.fromEntries(
    Object.keys(all).map((k) => [k, all[k as keyof Buckets] - demo[k as keyof Buckets]]),
  ) as unknown as Buckets;
export function aggregateActivity(
  center: ActivityCenter,
  query: ActivityQuery,
  asOf: string,
  classes: { id: number; name: string }[],
  members: Member[],
  events: ActivationEvent[],
  academicYear: ActivityReport['academicYear'] = null,
): ActivityReport {
  const window = reportWindow(query.period, asOf),
    byChild = new Map<number, Member[]>(),
    byEvents = new Map<number, ActivationEvent[]>();
  for (const member of members) {
    const rows = byChild.get(member.childId) ?? [];
    rows.push(member);
    byChild.set(member.childId, rows);
  }
  for (const event of events) {
    const rows = byEvents.get(event.childId) ?? [];
    rows.push(event);
    byEvents.set(event.childId, rows);
  }
  const output = classes.map((c) => ({
      ...c,
      all: emptyBuckets(),
      demo: emptyBuckets(),
      nonDemo: emptyBuckets(),
    })),
    byClass = new Map(output.map((c) => [c.id, c]));
  const all = emptyBuckets(),
    demo = emptyBuckets(),
    quality = {
      assumedFull: 0,
      futureEvents: 0,
      conflictingHistory: 0,
      outsideHistory: 0,
      invalidHistory: 0,
      centerlessEvents: 0,
      duplicateEnrollments: 0,
      overlappingStudents: 0,
    };
  for (const [id, rows] of byChild) {
    const history = byEvents.get(id) ?? [],
      calculated = calculateActivity(history, query.period, asOf, query.centerType);
    const outside = rows.some((r) => r.outsideHistory),
      invalid = rows.some((r) => r.invalidHistory);
    const contradictory = rows.some((r) => r.demo !== rows[0].demo);
    const days = outside || invalid || contradictory ? null : calculated.days;
    quality.assumedFull += calculated.assumed && days !== null ? 1 : 0;
    quality.futureEvents += calculated.future;
    quality.conflictingHistory += calculated.conflict || contradictory ? 1 : 0;
    quality.outsideHistory += outside ? 1 : 0;
    quality.invalidHistory += invalid ? 1 : 0;
    quality.centerlessEvents += history.filter((e) => e.centerless).length;
    const classIds = [...new Set(rows.map((r) => r.classId))];
    quality.overlappingStudents += classIds.length > 1 ? 1 : 0;
    quality.duplicateEnrollments +=
      rows.reduce((n, r) => n + (r.duplicates ?? 0), 0) + rows.length - classIds.length;
    add(all, days);
    if (rows[0].demo) add(demo, days);
    for (const classId of classIds) {
      const item = byClass.get(classId);
      if (!item) throw new Error('CLASS_MAPPING_CHANGED');
      add(item.all, days);
      if (rows[0].demo) add(item.demo, days);
    }
  }
  for (const row of output) row.nonDemo = subtract(row.all, row.demo);
  return {
    center,
    period: query.period,
    academicYear,
    includeDeleted: query.includeDeleted === 'true',
    policy: ACTIVITY_POLICY,
    asOf,
    start: window.start,
    endExclusive: window.end,
    maxDays: window.maxDays,
    totals: { all, demo, nonDemo: subtract(all, demo) },
    classes: output,
    quality,
  };
}
