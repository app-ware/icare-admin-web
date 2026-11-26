import { z } from 'zod';
import { requireActor } from '@/server/auth/session';
import { endpoint, json, assertOrigin, readJson } from '@/server/http';
import { createCenterView, listCenterViews } from '@/server/centers/views';
const query = (request: Request) =>
  z
    .object({})
    .strict()
    .parse(Object.fromEntries(new URL(request.url).searchParams));
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await requireActor();
    query(request);
    return json(listCenterViews(actor));
  });
}
export async function POST(request: Request) {
  return endpoint(async () => {
    assertOrigin(request);
    const actor = await requireActor();
    query(request);
    return json(createCenterView(actor, await readJson(request)), 201);
  });
}
