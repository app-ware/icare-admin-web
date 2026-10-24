import { requireActor } from '@/server/auth/session';
import { endpoint, json, readJson, assertOrigin } from '@/server/http';
import {
  centerUserQuerySchema,
  centerUserKeySchema,
  centerUserUpdateSchema,
} from '@/domain/center-users';
import { getCenterUser, updateCenterUser } from '@/server/center-users/repository';
type Context = { params: Promise<{ type: string; centerId: string; key: string }> };
function parse(params: Awaited<Context['params']>) {
  const query = centerUserQuerySchema.parse({ centerId: params.centerId, centerType: params.type });
  return {
    ref: { id: query.centerId, type: query.centerType },
    key: centerUserKeySchema.parse(params.key),
  };
}
export async function GET(_request: Request, context: Context) {
  return endpoint(async () => {
    const actor = await requireActor(),
      { ref, key } = parse(await context.params);
    return json(await getCenterUser(actor, ref, key));
  });
}
export async function PATCH(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor(),
      { ref, key } = parse(await context.params);
    return json(
      await updateCenterUser(
        actor,
        ref,
        key,
        centerUserUpdateSchema.parse(await readJson(request)),
      ),
    );
  });
}
