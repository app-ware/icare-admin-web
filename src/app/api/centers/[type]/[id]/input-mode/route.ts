import { z } from 'zod';
import { centerRefSchema } from '@/domain/centers';
import { inputModeChangeSchema } from '@/domain/input-mode';
import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, json, readJson } from '@/server/http';
import { getInputMode, changeInputMode } from '@/server/input-mode/repository';
type Context = { params: Promise<{ type: string; id: string }> };
async function ref(context: Context) {
  const p = await context.params;
  return centerRefSchema.parse({ id: Number(p.id), type: Number(p.type) });
}
export async function GET(request: Request, context: Context) {
  return endpoint(async () => {
    const actor = await requireActor();
    z.object({})
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return json(await getInputMode(actor, await ref(context)));
  });
}
export async function PATCH(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    return json(
      await changeInputMode(
        actor,
        await ref(context),
        inputModeChangeSchema.parse(await readJson(request)),
      ),
    );
  });
}
