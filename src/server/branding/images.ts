import 'server-only';
import sharp from 'sharp';
import {
  IMAGE_MAX_BYTES,
  IMAGE_MAX_PIXELS,
  IMAGE_MAX_DIMENSION,
  IMAGE_OUTPUT_DIMENSION,
  type BrandingKind,
} from '@/domain/branding';
import { PortalError } from '@/server/http';

// Center and draft routes share a process budget, including across dev module reloads.
const imageRuntime = globalThis as typeof globalThis & {
  icareImageBudget?: { decoding: number; uploads: number };
};
const budget = (imageRuntime.icareImageBudget ??= { decoding: 0, uploads: 0 });
export function reserveImageUpload() {
  if (budget.uploads >= 2)
    throw new PortalError(429, 'IMAGE_UPLOAD_BUSY', 'Image uploads are busy. Try again shortly.');
  budget.uploads++;
  let released = false;
  return () => {
    if (!released) {
      released = true;
      budget.uploads--;
    }
  };
}
const invalid = () =>
  new PortalError(
    422,
    'INVALID_IMAGE',
    'Use a complete, still JPEG, PNG or WebP image within the size limits.',
  );
export async function readImageBody(request: Request) {
  const length = request.headers.get('content-length');
  if (length && (!/^\d+$/.test(length) || Number(length) > IMAGE_MAX_BYTES))
    throw new PortalError(413, 'IMAGE_TOO_LARGE', 'Use an image of at most 5 MB.');
  const reader = request.body?.getReader();
  if (!reader) throw invalid();
  const chunks: Uint8Array[] = [];
  let size = 0,
    expired = false;
  const timer = setTimeout(() => {
    expired = true;
    void reader.cancel().catch(() => undefined);
  }, 10_000);
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (expired)
        throw new PortalError(408, 'UPLOAD_TIMEOUT', 'The upload took too long. Try again.');
      if (done) break;
      size += value.byteLength;
      if (size > IMAGE_MAX_BYTES) {
        void reader.cancel().catch(() => undefined);
        throw new PortalError(413, 'IMAGE_TOO_LARGE', 'Use an image of at most 5 MB.');
      }
      chunks.push(value);
    }
    return Buffer.concat(chunks);
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}
export async function normalizeImage(
  bytes: Buffer,
  kind: BrandingKind,
  mime: string,
  extension: string,
) {
  if (!bytes.length || bytes.length > IMAGE_MAX_BYTES) throw invalid();
  const type = bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
    ? 'png'
    : bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255
      ? 'jpeg'
      : bytes.toString('ascii', 0, 4) === 'RIFF' && bytes.toString('ascii', 8, 12) === 'WEBP'
        ? 'webp'
        : null;
  if (
    kind === 'watermark' &&
    (type !== 'png' || mime !== 'image/png' || extension.toLowerCase() !== 'png')
  )
    throw new PortalError(
      422,
      'INVALID_WATERMARK',
      'Use a still PNG watermark at exactly 1024 × 1024 pixels.',
    );
  if (
    !type ||
    mime !== `image/${type}` ||
    !{ png: ['png'], jpeg: ['jpg', 'jpeg'], webp: ['webp'] }[type].includes(extension.toLowerCase())
  )
    throw invalid();
  if (budget.decoding >= 2)
    throw new PortalError(
      429,
      'IMAGE_PROCESSOR_BUSY',
      'Image processing is busy. Try again shortly.',
    );
  budget.decoding++;
  try {
    const image = sharp(bytes, { limitInputPixels: IMAGE_MAX_PIXELS, failOn: 'warning' }).timeout({
      seconds: 5,
    });
    const meta = await image.metadata();
    if (
      meta.format !== type ||
      (meta.pages ?? 1) !== 1 ||
      !meta.width ||
      !meta.height ||
      meta.width > IMAGE_MAX_DIMENSION ||
      meta.height > IMAGE_MAX_DIMENSION ||
      meta.width * meta.height > IMAGE_MAX_PIXELS
    )
      throw invalid();
    if (
      kind === 'watermark' &&
      (meta.width !== IMAGE_OUTPUT_DIMENSION || meta.height !== IMAGE_OUTPUT_DIMENSION)
    )
      throw new PortalError(
        422,
        'INVALID_WATERMARK',
        'Use a still PNG watermark at exactly 1024 × 1024 pixels.',
      );
    const pipeline = image
      .autoOrient()
      .resize(IMAGE_OUTPUT_DIMENSION, IMAGE_OUTPUT_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true,
      })
      .toColourspace('srgb');
    // Default Sharp output strips EXIF/GPS and other source metadata. Originals are never stored.
    const { data, info } = await (
      kind !== 'photo'
        ? pipeline.png({ compressionLevel: 6 })
        : pipeline.flatten({ background: '#ffffff' }).jpeg({ quality: 85 })
    ).toBuffer({ resolveWithObject: true });
    if (data.length > IMAGE_MAX_BYTES) throw invalid();
    return {
      data,
      width: info.width,
      height: info.height,
      mime: (kind !== 'photo' ? 'image/png' : 'image/jpeg') as 'image/png' | 'image/jpeg',
      bytes: data.length,
    };
  } catch (error) {
    if (error instanceof PortalError) throw error;
    throw invalid();
  } finally {
    budget.decoding--;
  }
}
