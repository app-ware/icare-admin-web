import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { centerOptionQuerySchema } from '@/domain/dealers';
import { assertDealerAdministrator, dealerCenterOptions } from '@/server/dealers/repository';
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await requireActor();
    assertDealerAdministrator(actor);
    return json(
      await dealerCenterOptions(
        actor,
        centerOptionQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
      ),
    );
  });
}
