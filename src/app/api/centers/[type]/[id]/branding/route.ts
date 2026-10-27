import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, json, readJson } from '@/server/http';
import { brandingRefSchema, brandingPublishSchema } from '@/domain/branding';
import { getBranding, publishBranding } from '@/server/branding/repository';
type Context = { params: Promise<{ type: string; id: string }> };
async function ref(context: Context) {
  const p = await context.params;
  return brandingRefSchema.parse({ id: Number(p.id), type: Number(p.type) });
}
export async function GET(_request: Request, context: Context) {
  return endpoint(async () => json(await getBranding(await requireActor(), await ref(context))));
}
export async function PATCH(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    return json(
      await publishBranding(
        actor,
        await ref(context),
        brandingPublishSchema.parse(await readJson(request)),
      ),
    );
  });
}
