import { z } from 'zod';
import { assertPermission } from '@/domain/access';
import { endpoint, json, readJson, assertOrigin, PortalError } from '@/server/http';
import { requireActor } from '@/server/auth/session';
import { getStore } from '@/server/store';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    assertPermission(actor, 'centers.create');
    if (actor.mode !== 'preview')
      throw new PortalError(
        503,
        'PROVISIONING_PENDING',
        'Live provisioning is pending reference-data reconciliation, storage and account migration. Your draft is saved.',
      );
    const { revision } = z
      .object({ revision: z.number().int().positive() })
      .strict()
      .parse(await readJson(request));
    return json(getStore().publishPreview(actor.dealerId, (await context.params).id, revision));
  });
}
