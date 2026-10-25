import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { statusRefSchema } from '@/domain/status';
import { getAlert } from '@/server/alerts/repository';
export async function GET(
  _request: Request,
  context: { params: Promise<{ id: string; type: string }> },
) {
  return endpoint(async () => {
    const p = await context.params;
    return json(
      await getAlert(
        await requireActor(),
        statusRefSchema.parse({ id: Number(p.id), type: Number(p.type) }),
      ),
    );
  });
}
