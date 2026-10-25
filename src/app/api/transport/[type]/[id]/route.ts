import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { transportRefSchema } from '@/domain/transport';
import { listBuses } from '@/server/transport/repository';
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; type: string }> },
) {
  return endpoint(async () => {
    const p = await context.params;
    return json(
      await listBuses(
        await requireActor(),
        transportRefSchema.parse({ id: Number(p.id), type: Number(p.type) }),
      ),
    );
  });
}
