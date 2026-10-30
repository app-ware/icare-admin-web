import { parseCowpayQuery } from '@/domain/cowpay';
import { requireActor } from '@/server/auth/session';
import { endpoint, json } from '@/server/http';
import { listCowpay } from '@/server/cowpay/repository';
export async function GET(request: Request) {
  return endpoint(async () => {
    const actor = await requireActor();
    return json(await listCowpay(actor, parseCowpayQuery(new URL(request.url).searchParams)));
  });
}
