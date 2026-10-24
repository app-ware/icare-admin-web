'use client';
export class RequestError extends Error {
  constructor(
    message: string,
    public status: number,
    public code: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = 'GET',
  data?: unknown,
  signal?: AbortSignal,
): Promise<T> {
  const response = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: data === undefined ? {} : { 'Content-Type': 'application/json' },
    body: data === undefined ? undefined : JSON.stringify(data),
    signal,
  });
  const body = await response.json();
  if (!response.ok)
    throw new RequestError(
      body.error?.message || 'Something went wrong. Please try again.',
      response.status,
      body.error?.code || 'REQUEST_FAILED',
    );
  return body as T;
}
