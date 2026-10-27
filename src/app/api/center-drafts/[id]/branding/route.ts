import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { getDraftBranding } from '@/server/drafts/repository';
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () =>
    json(await getDraftBranding(await requireActor(), (await context.params).id)),
  );
}
