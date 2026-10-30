import { z } from 'zod';
import { assertPermission } from '@/domain/access';
import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { mapConfiguration } from '@/server/maps/configuration';

export async function GET(request: Request) {
  return endpoint(async () => {
    assertPermission(await requireActor(), 'centers.create');
    z.object({})
      .strict()
      .parse(Object.fromEntries(new URL(request.url).searchParams));
    return json(mapConfiguration());
  });
}
