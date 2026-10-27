import { z } from 'zod';
import { draftSchema } from '@/domain/management';
import { assertPermission } from '@/domain/access';
import { endpoint, json, readJson, assertOrigin } from '@/server/http';
import { requireActor } from '@/server/auth/session';
import { getDraft, saveDraft, deleteDraft } from '@/server/drafts/repository';
type Context = { params: Promise<{ id: string }> };
export async function GET(_request: Request, context: Context) {
  return endpoint(async () =>
    json(await getDraft(await requireActor(), (await context.params).id)),
  );
}
export async function PATCH(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    assertPermission(actor, 'centers.create');
    const input = z
      .object({ revision: z.number().int().positive(), data: draftSchema })
      .strict()
      .parse(await readJson(request));
    return json(await saveDraft(actor, input.data, (await context.params).id, input.revision));
  });
}
export async function DELETE(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    assertPermission(actor, 'centers.create');
    const { revision } = z
      .object({ revision: z.number().int().positive() })
      .strict()
      .parse(await readJson(request));
    await deleteDraft(actor, (await context.params).id, revision);
    return json({ ok: true });
  });
}
