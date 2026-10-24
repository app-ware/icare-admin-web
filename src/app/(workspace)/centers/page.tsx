import { CenterDirectory } from '@/features/centers/center-directory';
import { requirePageActor } from '@/server/auth/session';
import { directoryQuerySchema } from '@/domain/management';
import { listCenters } from '@/server/centers/repository';
export const metadata = { title: 'Care centers' };
export default async function CentersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePageActor();
  const params = await searchParams;
  const parsed = directoryQuerySchema.safeParse(params);
  const query = parsed.success ? parsed.data : directoryQuerySchema.parse({});
  let result = null;
  try {
    result = await listCenters(actor, query);
  } catch {}
  return (
    <CenterDirectory
      initial={result}
      initialQuery={query}
      mode={actor.mode}
      initialCreate={params.create === '1'}
      initialTab={params.tab === 'drafts' ? 'drafts' : 'directory'}
    />
  );
}
