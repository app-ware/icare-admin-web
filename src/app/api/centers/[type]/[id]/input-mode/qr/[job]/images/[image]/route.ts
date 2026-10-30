import { z } from 'zod';
import { centerRefSchema } from '@/domain/centers';
import { requireActor } from '@/server/auth/session';
import { endpoint } from '@/server/http';
import { readQrImage } from '@/server/input-mode/jobs';
export async function GET(
  request: Request,
  context: { params: Promise<{ type: string; id: string; job: string; image: string }> },
) {
  return endpoint(async () => {
    const actor = await requireActor(),
      p = await context.params;
    z.object({})
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    const data = await readQrImage(
      actor,
      centerRefSchema.parse({ id: Number(p.id), type: Number(p.type) }),
      p.job,
      p.image,
    );
    return new Response(new Uint8Array(data), {
      headers: {
        'Content-Type': 'image/png',
        'Content-Disposition': 'inline; filename="demo-qr.png"',
        'Cache-Control': 'no-store, private',
        Vary: 'Cookie',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Referrer-Policy': 'no-referrer',
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  });
}
