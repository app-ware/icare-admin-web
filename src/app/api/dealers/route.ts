import { requireActor } from '@/server/auth/session';
import { endpoint, json, readJson, assertOrigin } from '@/server/http';
import { dealerCreateSchema, dealerQuerySchema } from '@/domain/dealers';
import { assertDealerAdministrator, createDealer, listDealers } from '@/server/dealers/repository';
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await requireActor();
    assertDealerAdministrator(actor);
    return json(
      await listDealers(
        actor,
        dealerQuerySchema.parse(Object.fromEntries(new URL(request.url).searchParams)),
      ),
    );
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    assertDealerAdministrator(actor);
    return json(await createDealer(actor, dealerCreateSchema.parse(await readJson(request))), 201);
  });
}
