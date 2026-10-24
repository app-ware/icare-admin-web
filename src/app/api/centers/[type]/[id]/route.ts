import { centerRefSchema } from '@/domain/centers';
import { profileUpdateSchema } from '@/domain/management';
import { endpoint, json, assertOrigin, readJson } from '@/server/http';
import { requireActor } from '@/server/auth/session';
import { getCenter, updateCenter } from '@/server/centers/repository';
type Context = { params: Promise<{ type: string; id: string }> };
async function ref(context: Context) {
  const p = await context.params;
  return centerRefSchema.parse({ id: Number(p.id), type: Number(p.type) });
}
export async function GET(_request: Request, context: Context) {
  return endpoint(async () => json(await getCenter(await requireActor(), await ref(context))));
}
export async function PATCH(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    const input = profileUpdateSchema.parse(await readJson(request));
    return json(await updateCenter(actor, await ref(context), input.revision, input.profile));
  });
}
