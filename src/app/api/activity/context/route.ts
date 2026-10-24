import { z } from 'zod';
import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { centerRefSchema } from '@/domain/centers';
import { activityContext, activityDealers, academicYears } from '@/server/activity/repository';
const schema = z.object({
  centerId: z.coerce.number().int().positive().max(2147483647).optional(),
  centerType: z.coerce.number().optional(),
});
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await requireActor(),
      query = schema.parse(Object.fromEntries(new URL(request.url).searchParams));
    const ref =
      query.centerId !== undefined || query.centerType !== undefined
        ? centerRefSchema.parse({ id: query.centerId, type: query.centerType })
        : undefined;
    const context = await activityContext(actor, ref);
    return json({
      ...context,
      dealers: await activityDealers(actor),
      academicYears: ref ? await academicYears(actor, ref) : [],
    });
  });
}
