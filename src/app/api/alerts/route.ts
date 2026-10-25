import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { alertQuerySchema } from '@/domain/alerts';
import { listAlerts } from '@/server/alerts/repository';
export async function GET(request: Request) {
  return endpoint(async () =>
    json(
      await listAlerts(
        await requireActor(),
        alertQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
      ),
    ),
  );
}
