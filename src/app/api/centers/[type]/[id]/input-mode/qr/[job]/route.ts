import { z } from 'zod';
import { centerRefSchema } from '@/domain/centers';
import { qrActionSchema } from '@/domain/input-mode';
import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, json, readJson } from '@/server/http';
import { getQrJob, actOnQrJob } from '@/server/input-mode/jobs';
type Context = { params: Promise<{ type: string; id: string; job: string }> };
export async function GET(request: Request, context: Context) {
  return endpoint(async () => {
    const actor = await requireActor(),
      p = await context.params;
    z.object({})
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return json(
      await getQrJob(
        actor,
        centerRefSchema.parse({ id: Number(p.id), type: Number(p.type) }),
        p.job,
      ),
    );
  });
}
export async function POST(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor(),
      p = await context.params;
    return json(
      await actOnQrJob(
        actor,
        centerRefSchema.parse({ id: Number(p.id), type: Number(p.type) }),
        p.job,
        qrActionSchema.parse(await readJson(request)),
      ),
    );
  });
}
