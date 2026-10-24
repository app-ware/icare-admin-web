import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { AccessDeniedError } from '@/domain/access';
import { reportCenterQuerySchema } from '@/domain/activity';
import { activityCenters } from '@/server/activity/repository';
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await requireActor(),
      query = reportCenterQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams));
    if (query.dealerId && !actor.isSuperAdmin) throw new AccessDeniedError();
    return json(await activityCenters(actor, query));
  });
}
