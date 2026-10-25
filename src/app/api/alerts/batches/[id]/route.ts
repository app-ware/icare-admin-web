import { z } from 'zod';
import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, json, readJson } from '@/server/http';
import { alertRetrySchema } from '@/domain/alerts';
import { getAlertBatch, retryAlertBatch } from '@/server/alerts/repository';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return endpoint(async () =>
    json(await getAlertBatch(await requireActor(), z.uuid().parse((await context.params).id))),
  );
}
export async function POST(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    alertRetrySchema.parse(await readJson(request));
    return json(await retryAlertBatch(actor, z.uuid().parse((await context.params).id)));
  });
}
