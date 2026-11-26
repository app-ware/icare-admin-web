import { requireActor } from '@/server/auth/session';
import { endpoint, json, readJson, assertOrigin } from '@/server/http';
import { exportRequestSchema } from '@/domain/activity';
import { generateReportExport } from '@/server/activity/exports';
import { reportHistoryPage } from '@/server/activity/report-copies';
import { reportHistoryQuerySchema } from '@/domain/report-downloads';
import { reportDownloadResponse } from '@/server/activity/report-response';
export const maxDuration = 120;
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await requireActor();
    return json(
      reportHistoryPage(
        actor,
        reportHistoryQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
      ),
    );
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor(),
      data = exportRequestSchema.parse(await readJson(request));
    const result = await generateReportExport(actor, data);
    return reportDownloadResponse(result);
  });
}
