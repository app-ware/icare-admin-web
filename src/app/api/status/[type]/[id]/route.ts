import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, json, readJson } from '@/server/http';
import { statusChangeSchema, statusRefSchema } from '@/domain/status';
import { changeStatus, getStatus } from '@/server/status/repository';
type Context = { params: Promise<{ id: string; type: string }> };
async function ref(context: Context) {
  const p = await context.params;
  return statusRefSchema.parse({ id: Number(p.id), type: Number(p.type) });
}
export async function GET(_request: Request, context: Context) {
  return endpoint(async () => json(await getStatus(await requireActor(), await ref(context))));
}
export async function PATCH(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    return json(
      await changeStatus(
        actor,
        await ref(context),
        statusChangeSchema.parse(await readJson(request)),
      ),
    );
  });
}
