import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { statusQuerySchema } from '@/domain/status';
import { listStatuses } from '@/server/status/repository';
export async function GET(request: Request) {
  return endpoint(async () =>
    json(
      await listStatuses(
        await requireActor(),
        statusQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
      ),
    ),
  );
}
