import 'server-only';
import { randomUUID } from 'node:crypto';
import { assertPermission, type PortalActor } from '@/domain/access';
import { type ExportRequest, type ActivityReport } from '@/domain/activity';
import { getStore } from '@/server/store';
import { PortalError } from '@/server/http';
import { getActivity, activityContext } from './repository';
import { activityWorkbook } from './workbook';
export function reportHistory(actor: PortalActor) {
  return getStore()
    .db.prepare(
      `SELECT id,params,state,created_at,finished_at,filename FROM report_exports
    WHERE dealer_id=? AND mode=? ORDER BY created_at DESC LIMIT 20`,
    )
    .all(actor.dealerId, actor.mode)
    .map((row) => ({
      id: String(row.id),
      state: String(row.state),
      createdAt: Number(row.created_at),
      finishedAt: row.finished_at === null ? null : Number(row.finished_at),
      filename: row.filename === null ? null : String(row.filename),
      request: JSON.parse(String(row.params)) as ExportRequest,
    }));
}
export async function generateReportExport(actor: PortalActor, data: ExportRequest) {
  for (const ref of data.centers) assertPermission(actor, 'reports.export', ref);
  const store = getStore();
  if (!store.consumeLimit(`report-export:${actor.mode}:${actor.dealerId}`, 6, 60000))
    throw new PortalError(429, 'EXPORT_LIMIT', 'Wait a minute before generating another workbook.');
  const id = randomUUID(),
    filename = `icare-activity-${data.period}-${id.slice(0, 8)}.xlsx`;
  store.db
    .prepare('INSERT INTO report_exports VALUES (?,?,?,?,?,?,NULL,NULL)')
    .run(id, actor.dealerId, actor.mode, JSON.stringify(data), 'preparing', Date.now());
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
    for (const ref of data.centers) await activityContext(actor, ref);
    store.db
      .prepare("UPDATE report_exports SET state='generated',finished_at=?,filename=? WHERE id=?")
      .run(Date.now(), filename, id);
    return { buffer, filename, id };
  } catch (error) {
    store.db
      .prepare("UPDATE report_exports SET state='failed',finished_at=? WHERE id=?")
      .run(Date.now(), id);
    throw error;
  }
}
