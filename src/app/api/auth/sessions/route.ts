import { endpoint, json, assertOrigin } from '@/server/http';
import { requireActor } from '@/server/auth/session';
import { getStore } from '@/server/store';
export async function GET() {
  return endpoint(async () => {
    const actor = await requireActor();
    return json({
      items: getStore().sessions(actor.dealerId, actor.mode),
      currentId: actor.sessionId,
    });
  });
}
export async function DELETE(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    getStore().revokeOthers(actor.dealerId, actor.mode, actor.sessionId);
    return json({ ok: true });
  });
}
