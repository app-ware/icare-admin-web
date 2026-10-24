import { draftSchema } from '@/domain/management';
import { assertPermission } from '@/domain/access';
import { endpoint, json, readJson, assertOrigin } from '@/server/http';
import { requireActor } from '@/server/auth/session';
import { getStore } from '@/server/store';
export async function GET() {
  return endpoint(async () => {
    const actor = await requireActor();
    assertPermission(actor, 'centers.create');
    return json({ items: getStore().drafts(actor.dealerId, actor.mode) });
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    assertPermission(actor, 'centers.create');
    const data = draftSchema.parse(await readJson(request));
    return json(getStore().saveDraft(actor.dealerId, actor.mode, data), 201);
  });
}
