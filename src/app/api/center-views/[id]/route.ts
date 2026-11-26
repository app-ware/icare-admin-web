import { z } from 'zod';
import { requireActor } from '@/server/auth/session';
import { endpoint, json, assertOrigin, readJson } from '@/server/http';
import { removeCenterView, updateCenterView } from '@/server/centers/views';
type Context = { params: Promise<{ id: string }> };
async function change(request: Request, context: Context, remove: boolean) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor(),
      { id } = await context.params;
    z.object({})
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const data = await readJson(request);
    return json(remove ? removeCenterView(actor, id, data) : updateCenterView(actor, id, data));
  });
}
export const PATCH = (request: Request, context: Context) => change(request, context, false);
export const DELETE = (request: Request, context: Context) => change(request, context, true);
