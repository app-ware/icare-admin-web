import { z } from 'zod';
import { requireActor } from '@/server/auth/session';
import { endpoint, json, assertOrigin, readJson } from '@/server/http';
import { restoreCenterView } from '@/server/centers/views';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor(),
      { id } = await context.params;
    z.object({})
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return json(restoreCenterView(actor, id, await readJson(request)));
  });
}
