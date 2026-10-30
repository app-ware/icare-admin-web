import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, json } from '@/server/http';
import { readDraftImage, discardDraftImage } from '@/server/drafts/repository';
type Context = { params: Promise<{ id: string; asset: string }> };
export async function GET(_request: Request, context: Context) {
  return endpoint(async () => {
    const actor = await requireActor(),
      p = await context.params,
      image = await readDraftImage(actor, p.id, p.asset);
    return new Response(new Uint8Array(image.data), {
      headers: {
        'Content-Type': image.mime,
        'Content-Length': String(image.data.length),
        'Content-Disposition': `inline; filename="draft-${image.kind === 'photo' ? 'photo.jpg' : image.kind === 'watermark' ? 'watermark.png' : 'logo.png'}"`,
        'Cache-Control': 'private, no-store',
        Vary: 'Cookie',
        'X-Content-Type-Options': 'nosniff',
        'Content-Security-Policy': "default-src 'none'; sandbox",
      },
    });
  });
}
export async function DELETE(request: Request, context: Context) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor(),
      p = await context.params;
    return json(await discardDraftImage(actor, p.id, p.asset));
  });
}
