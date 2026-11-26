import 'server-only';
export function reportDownloadResponse(result: {
  id: string;
  filename: string;
  buffer: Buffer;
  retained: boolean;
  expiresAt: number | null;
  attemptId: string;
}) {
  return new Response(new Uint8Array(result.buffer), {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${result.filename}"`,
      'Cache-Control': 'no-store, private',
      Vary: 'Cookie',
      'X-Content-Type-Options': 'nosniff',
      'X-Report-ID': result.id,
      'X-Report-Attempt-ID': result.attemptId,
      'X-Report-Bytes': String(result.buffer.length),
      'X-Report-Retained': String(result.retained),
      ...(result.expiresAt == null ? {} : { 'X-Report-Expires-At': String(result.expiresAt) }),
    },
  });
}
