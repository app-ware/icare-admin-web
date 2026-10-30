import 'server-only';
import QRCode from 'qrcode';
import jsQR from 'jsqr';
import sharp from 'sharp';
import { PortalError } from '@/server/http';

// Only fictional, unmistakably non-legacy values are accepted until scanner compatibility is verified.
export async function renderDemoQr(payload: string, watermark: Buffer | null): Promise<Buffer> {
  if (!/^ICARE-DEMO:[a-f0-9-]{36}$/.test(payload)) throw new Error('Unsupported QR payload');
  let image = await QRCode.toBuffer(payload, {
    type: 'png',
    width: 768,
    margin: 4,
    errorCorrectionLevel: 'H',
  });
  if (watermark) {
    const stamp = await sharp(watermark, { limitInputPixels: 1024 * 1024 })
      .resize(128, 128)
      .png()
      .toBuffer();
    image = await sharp(image)
      .composite([{ input: stamp, gravity: 'centre' }])
      .png()
      .toBuffer();
  }
  const { data, info } = await sharp(image)
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  if (
    jsQR(new Uint8ClampedArray(data), info.width, info.height, { inversionAttempts: 'dontInvert' })
      ?.data !== payload
  )
    throw new PortalError(
      422,
      'QR_SCAN_FAILED',
      'The QR image could not be verified. Try again without a watermark.',
    );
  return image;
}
