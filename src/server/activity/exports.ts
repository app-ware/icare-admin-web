import 'server-only';
import { randomUUID } from 'node:crypto';
import { assertPermission, type PortalActor } from '@/domain/access';
import { exportRequestSchema, type ExportRequest, type ActivityReport } from '@/domain/activity';
import { getStore } from '@/server/store';
import { PortalError } from '@/server/http';
import { getActivity, activityContext } from './repository';
import { activityWorkbook } from './workbook';
import {
  reportHistoryPage,
  retainReportCopy,
  reportDeliveryAttempt,
  consumeReportDownload,
} from './report-copies';
const exportRuntime = globalThis as typeof globalThis & { icareReportExports?: { active: number } };
const budget = (exportRuntime.icareReportExports ??= { active: 0 });
export function reportHistory(actor: PortalActor) {
  return reportHistoryPage(actor).items;
}
export async function generateReportExport(actor: PortalActor, input: ExportRequest) {
  const data = exportRequestSchema.parse(input);
  for (const ref of data.centers) assertPermission(actor, 'reports.export', ref);
  const store = getStore();
  if (!store.consumeLimit(`report-export:${actor.mode}:${actor.dealerId}`, 6, 60000))
    throw new PortalError(429, 'EXPORT_LIMIT', 'Wait a minute before generating another workbook.');
  if (budget.active >= 2)
    throw new PortalError(429, 'EXPORT_BUSY', 'Workbook preparation is busy. Try again shortly.');
  const id = randomUUID(),
    filename = `icare-activity-${data.period}-${id.slice(0, 8)}.xlsx`;
  store.db
    .prepare('INSERT INTO report_exports VALUES (?,?,?,?,?,?,NULL,NULL)')
    .run(id, actor.dealerId, actor.mode, JSON.stringify(data), 'preparing', Date.now());
  budget.active++;
  try {
    const reports: ActivityReport[] = [];
    for (const ref of data.centers) {
      reports.push(
        await getActivity(actor, {
          centerId: ref.id,
          centerType: ref.type,
          period: data.period,
          includeDeleted: data.includeDeleted ? 'true' : 'false',
          academicYearId: data.academicYearId,
        }),
      );
      if (reports.reduce((n, r) => n + r.classes.length, 0) > 5000)
        throw new PortalError(
          422,
          'EXPORT_SIZE_LIMIT',
          'Select fewer centers to keep this workbook within the interactive limit.',
        );
    }
    const buffer = await activityWorkbook(reports);
    if (buffer.length > 50 * 1024 * 1024)
      throw new PortalError(
        422,
        'EXPORT_SIZE_LIMIT',
        'Select fewer centers to keep the workbook within the download limit.',
      );
    for (const ref of data.centers) await activityContext(actor, ref);
    consumeReportDownload(actor);
    return store.transaction(() => {
      store.db
        .prepare("UPDATE report_exports SET state='generated',finished_at=?,filename=? WHERE id=?")
        .run(Date.now(), filename, id);
      const copy = retainReportCopy(actor, id, buffer);
      const attemptId = reportDeliveryAttempt(actor, id, buffer.length);
      return { buffer, filename, id, ...copy, attemptId };
    });
  } catch (error) {
    store.db
      .prepare("UPDATE report_exports SET state='failed',finished_at=? WHERE id=?")
      .run(Date.now(), id);
    throw error;
  } finally {
    budget.active--;
  }
}
