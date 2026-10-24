import { requireActor } from '@/server/auth/session';
import { endpoint, json, PortalError } from '@/server/http';
import { listCenters } from '@/server/centers/repository';
import { directoryQuerySchema } from '@/domain/management';
export const dynamic = 'force-dynamic';
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await requireActor();
    if (actor.mode !== 'legacy')
      throw new PortalError(403, 'LIVE_ACCOUNT_REQUIRED', 'Use an iCare account for live data.');
    return json(
      await listCenters(
        actor,
        directoryQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
      ),
    );
  });
}
