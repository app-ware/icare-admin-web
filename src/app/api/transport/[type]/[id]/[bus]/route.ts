import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, json, readJson } from '@/server/http';
import { transportRefSchema, busIdSchema, busChangeSchema } from '@/domain/transport';
import { getBus, changeBus } from '@/server/transport/repository';
type Context = { params: Promise<{ id: string; type: string; bus: string }> };
async function ref(context: Context) {
  const p = await context.params;
  return {
    center: transportRefSchema.parse({ id: Number(p.id), type: Number(p.type) }),
    bus: busIdSchema.parse(p.bus),
  };
}
export async function GET(_request: Request, context: Context) {
  return endpoint(async () => {
    const actor = await requireActor(),
      p = await ref(context);
    return json(await getBus(actor, p.center, p.bus));
  });
}
export async function PATCH(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor(),
      p = await ref(context);
    return json(
      await changeBus(actor, p.center, p.bus, busChangeSchema.parse(await readJson(request))),
    );
  });
}
