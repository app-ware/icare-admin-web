import { z } from 'zod';
import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, json } from '@/server/http';
import { brandingRefSchema, brandingKindSchema } from '@/domain/branding';
import { prepareBrandingUpload, stageBranding } from '@/server/branding/repository';
import { readImageBody, reserveImageUpload } from '@/server/branding/images';
export async function POST(
  request: Request,
  context: { params: Promise<{ type: string; id: string }> },
) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor(),
      p = await context.params;
    const ref = brandingRefSchema.parse({ id: Number(p.id), type: Number(p.type) });
    const { kind } = z
      .object({ kind: brandingKindSchema })
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    await prepareBrandingUpload(actor, ref);
    const release = reserveImageUpload();
    try {
      return json(
        await stageBranding(
          actor,
          ref,
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
