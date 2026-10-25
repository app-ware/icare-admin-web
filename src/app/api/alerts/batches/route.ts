import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, json, readJson } from '@/server/http';
import { alertBatchSchema } from '@/domain/alerts';
import { submitAlertBatch } from '@/server/alerts/repository';
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    return json(
      await submitAlertBatch(await requireActor(), alertBatchSchema.parse(await readJson(request))),
    );
  });
}
