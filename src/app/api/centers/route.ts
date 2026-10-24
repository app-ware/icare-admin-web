import { directoryQuerySchema } from '@/domain/management';
import { endpoint, json } from '@/server/http';
import { requireActor } from '@/server/auth/session';
import { listCenters } from '@/server/centers/repository';
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await requireActor();
    const query = directoryQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    return json(await listCenters(actor, query));
  });
}
