import { z } from 'zod';
import { requireActor } from '@/server/auth/session';
import { endpoint, json, readJson, assertOrigin } from '@/server/http';
import { dealerUpdateSchema } from '@/domain/dealers';
import { assertDealerAdministrator, getDealer, updateDealer } from '@/server/dealers/repository';
type Context = { params: Promise<{ id: string }> };
const idSchema = z.coerce.number().int().positive().max(2147483647);
export async function GET(_request: Request, context: Context) {
  return endpoint(async () => {
    const actor = await requireActor();
    assertDealerAdministrator(actor);
    return json(await getDealer(actor, idSchema.parse((await context.params).id)));
  });
}
export async function PATCH(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    assertDealerAdministrator(actor);
    return json(
      await updateDealer(
        actor,
        idSchema.parse((await context.params).id),
        dealerUpdateSchema.parse(await readJson(request)),
      ),
    );
  });
}
