import { z } from 'zod';
import { assertPermission } from '@/domain/access';
import { endpoint, json, readJson, assertOrigin } from '@/server/http';
import { requireActor } from '@/server/auth/session';
import { publishDraft } from '@/server/drafts/repository';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    assertPermission(actor, 'centers.create');
    const { revision } = z
      .object({ revision: z.number().int().positive() })
      .strict()
      .parse(await readJson(request));
    return json(await publishDraft(actor, (await context.params).id, revision));
  });
}
