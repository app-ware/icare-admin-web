import { z } from 'zod';
import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, json, readJson } from '@/server/http';
import { acknowledgeReport } from '@/server/activity/report-copies';
import { reportReceiptSchema } from '@/domain/report-downloads';
export const maxDuration = 120;
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor(),
      { id } = await context.params;
    z.object({})
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return json(
      await acknowledgeReport(actor, id, reportReceiptSchema.parse(await readJson(request))),
    );
  });
}
