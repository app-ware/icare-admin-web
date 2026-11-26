import { z } from 'zod';
import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, readJson } from '@/server/http';
import { downloadReportCopy } from '@/server/activity/report-copies';
import { reportDownloadResponse } from '@/server/activity/report-response';
export const maxDuration = 120;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor(),
      { id } = await context.params;
    z.object({})
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    z.object({})
      .strict()
      .parse(await readJson(request));
    return reportDownloadResponse(await downloadReportCopy(actor, id));
  });
}
