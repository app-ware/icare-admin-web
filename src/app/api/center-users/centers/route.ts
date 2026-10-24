import { z } from 'zod';
import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { centerUserOptions } from '@/server/center-users/repository';
const schema = z.object({
  q: z.string().trim().max(100).default(''),
  page: z.coerce.number().int().min(1).max(100000).default(1),
});
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await requireActor();
    return json(
      await centerUserOptions(
        actor,
        schema.parse(Object.fromEntries(new URL(request.url).searchParams)),
      ),
    );
  });
}
