import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { transportQuerySchema } from '@/domain/transport';
import { listTransportCenters } from '@/server/transport/repository';
export async function GET(request: Request) {
  return endpoint(async () =>
    json(
      await listTransportCenters(
        await requireActor(),
        transportQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
      ),
    ),
  );
}
