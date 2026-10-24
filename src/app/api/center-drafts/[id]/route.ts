import { z } from 'zod';
import { draftSchema } from '@/domain/management';
import { assertPermission } from '@/domain/access';
import { endpoint, json, readJson, assertOrigin } from '@/server/http';
import { requireActor } from '@/server/auth/session';
import { getStore } from '@/server/store';
type Context = { params: Promise<{ id: string }> };
export async function PATCH(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    assertPermission(actor, 'centers.create');
    const input = z
      .object({ revision: z.number().int().positive(), data: draftSchema })
      .strict()
      .parse(await readJson(request));
    return json(
      getStore().saveDraft(
        actor.dealerId,
        actor.mode,
        input.data,
        (await context.params).id,
        input.revision,
      ),
    );
  });
}
export async function DELETE(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    assertPermission(actor, 'centers.create');
    getStore().deleteDraft(actor.dealerId, actor.mode, (await context.params).id);
    return json({ ok: true });
  });
}
