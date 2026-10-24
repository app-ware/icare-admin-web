import 'server-only';
import { randomUUID } from 'node:crypto';
import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { AccessDeniedError } from '@/domain/access';

const errorBrand = Symbol.for('icare.portal.error');
export class PortalError extends Error {
  readonly [errorBrand] = true;
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
    this.name = 'PortalError';
  }
}
// Store instances can survive development module reloads; instanceof alone is insufficient.
function isPortalError(error: unknown): error is PortalError {
  return (
    error instanceof PortalError ||
    Boolean(error && typeof error === 'object' && errorBrand in error && error[errorBrand] === true)
  );
}
export function assertOrigin(request: Request) {
  if (process.env.NODE_ENV === 'production' && !process.env.ICARE_APP_ORIGIN)
    throw new PortalError(
      503,
      'ORIGIN_NOT_CONFIGURED',
      'The portal address needs to be configured by your administrator.',
    );
  let expected = process.env.ICARE_APP_ORIGIN;
  if (!expected) {
    // Next's development Request URL can normalize 127.0.0.1 to localhost.
    // Only trust a loopback Host for this local development fallback.
    const url = new URL(request.url);
    const candidate = new URL(`${url.protocol}//${request.headers.get('host') || url.host}`);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(candidate.hostname))
      throw new PortalError(
        403,
        'ORIGIN_REJECTED',
        'Configure the portal address before using this host.',
      );
    expected = candidate.origin;
  }
  const origin = request.headers.get('origin');
  if (!origin || origin !== expected || request.headers.get('sec-fetch-site') === 'cross-site')
    throw new PortalError(403, 'ORIGIN_REJECTED', 'Refresh this page and try again.');
}
export async function readJson(request: Request) {
  if (!request.headers.get('content-type')?.startsWith('application/json'))
    throw new PortalError(415, 'JSON_REQUIRED', 'Use a JSON request.');
  const reader = request.body?.getReader();
  if (!reader) throw new PortalError(400, 'INVALID_REQUEST', 'The request is empty.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > 32768) {
        await reader.cancel();
        throw new PortalError(413, 'REQUEST_TOO_LARGE', 'The request is too large.');
      }
      chunks.push(value);
    }
    return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown;
  } catch (error) {
    if (error instanceof PortalError) throw error;
    throw new PortalError(400, 'INVALID_JSON', 'The request could not be read.');
  }
}
export function json(value: unknown, status = 200) {
  return NextResponse.json(value, { status, headers: { 'Cache-Control': 'no-store' } });
}
export async function endpoint(action: () => Promise<Response>): Promise<Response> {
  try {
    return await action();
  } catch (error) {
    const requestId = randomUUID();
    if (error instanceof ZodError)
      return json(
        {
          error: {
            code: 'VALIDATION_FAILED',
            message: 'Check the highlighted fields.',
            requestId,
            fields: error.flatten().fieldErrors,
          },
        },
        422,
      );
    if (error instanceof AccessDeniedError)
      return json(
        {
          error: {
            code: 'ACCESS_DENIED',
            message: 'You do not have access to this action.',
            requestId,
          },
        },
        403,
      );
    if (isPortalError(error))
      return json({ error: { code: error.code, message: error.message, requestId } }, error.status);
    // Do not serialize database exceptions, request bodies, credentials or profile data.
    console.error('Portal request failed', {
      requestId,
      category: error instanceof Error ? error.name : 'UnknownError',
      code:
        typeof error === 'object' && error !== null && 'code' in error
          ? String(error.code).slice(0, 40)
          : undefined,
    });
    return json(
      {
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'The service is temporarily unavailable. Please try again.',
          requestId,
        },
      },
      503,
    );
  }
}
