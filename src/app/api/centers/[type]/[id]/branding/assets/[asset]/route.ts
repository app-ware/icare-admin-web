import { requireActor } from '@/server/auth/session';
import { assertOrigin, endpoint, json } from '@/server/http';
import { brandingRefSchema } from '@/domain/branding';
import { discardBranding, readBrandingImage } from '@/server/branding/repository';
type Context = { params: Promise<{ type: string; id: string; asset: string }> };
async function params(context: Context) {
  const p = await context.params;
  return {
    ref: brandingRefSchema.parse({ id: Number(p.id), type: Number(p.type) }),
    asset: p.asset,
  };
}
export async function GET(_request: Request, context: Context) {
  return endpoint(async () => {
    const actor = await requireActor(),
      p = await params(context),
      image = await readBrandingImage(actor, p.ref, p.asset);
    return new Response(new Uint8Array(image.data), {
      headers: {
        'Content-Type': image.mime,
        'Content-Length': String(image.data.length),
        'Content-Disposition': `inline; filename="${image.kind === 'logo' ? 'logo.png' : 'center-photo.jpg'}"`,
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
      p = await params(context);
    return json(await discardBranding(actor, p.ref, p.asset));
  });
}
