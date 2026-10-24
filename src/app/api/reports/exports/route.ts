import { requireActor } from '@/server/auth/session';
import { endpoint, json, readJson, assertOrigin } from '@/server/http';
import { exportRequestSchema } from '@/domain/activity';
import { generateReportExport, reportHistory } from '@/server/activity/exports';
export const maxDuration = 120;
export async function GET() {
  return endpoint(async () => json({ items: reportHistory(await requireActor()) }));
}
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor(),
      data = exportRequestSchema.parse(await readJson(request));
    const result = await generateReportExport(actor, data);
    return new Response(new Uint8Array(result.buffer), {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="${result.filename}"`,
        'Cache-Control': 'no-store',
        'X-Report-ID': result.id,
      },
    });
  });
}
