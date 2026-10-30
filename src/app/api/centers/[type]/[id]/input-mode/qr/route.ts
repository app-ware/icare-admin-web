import { centerRefSchema } from '@/domain/centers';
import { qrStartSchema } from '@/domain/input-mode';
import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, json, readJson } from '@/server/http';
import { startQrJob } from '@/server/input-mode/jobs';
export async function POST(
  request: Request,
  context: { params: Promise<{ type: string; id: string }> },
) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor(),
      p = await context.params;
    return json(
      await startQrJob(
        actor,
        centerRefSchema.parse({ id: Number(p.id), type: Number(p.type) }),
        qrStartSchema.parse(await readJson(request)),
      ),
      201,
    );
  });
}
