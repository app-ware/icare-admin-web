import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { activityQuerySchema } from '@/domain/activity';
import { getActivity } from '@/server/activity/repository';
export async function GET(request: Request) {
  return endpoint(async () =>
    json(
      await getActivity(
        await requireActor(),
        activityQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
      ),
    ),
  );
}
