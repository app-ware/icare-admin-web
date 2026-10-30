import { z } from 'zod';
import { cowpayRefSchema } from '@/domain/cowpay';
import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { getCowpay } from '@/server/cowpay/repository';
export async function GET(
  request: Request,
  context: { params: Promise<{ type: string; id: string }> },
) {
  return endpoint(async () => {
    const actor = await requireActor(),
      p = await context.params;
    z.object({})
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return json(
      await getCowpay(actor, cowpayRefSchema.parse({ id: Number(p.id), type: Number(p.type) })),
    );
  });
}
