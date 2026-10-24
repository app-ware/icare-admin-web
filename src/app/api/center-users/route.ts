import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { centerUserQuerySchema } from '@/domain/center-users';
import { listCenterUsers } from '@/server/center-users/repository';
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await requireActor();
    return json(
      await listCenterUsers(
        actor,
        centerUserQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
      ),
    );
  });
}
