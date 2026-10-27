import { z } from 'zod';
import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, json } from '@/server/http';
import { brandingKindSchema } from '@/domain/branding';
import { readImageBody, reserveImageUpload } from '@/server/branding/images';
import { prepareDraftUpload, stageDraftImage } from '@/server/drafts/repository';
export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor(),
      id = (await context.params).id;
    const { kind } = z
      .object({ kind: brandingKindSchema })
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    await prepareDraftUpload(actor, id);
    const release = reserveImageUpload();
    try {
      return json(
        await stageDraftImage(
          actor,
          id,
          kind,
          await readImageBody(request),
          request.headers.get('content-type') ?? '',
          request.headers.get('x-image-extension') ?? '',
        ),
        201,
      );
    } finally {
      release();
    }
  });
}
