import { requirePageActor } from '@/server/auth/session';
import { centerUserQuerySchema } from '@/domain/center-users';
import {
  centerUserOptions,
  legacyUserMappingIssues,
  listCenterUsers,
} from '@/server/center-users/repository';
import { CenterUsersDirectory } from '@/features/center-users/user-directory';
export const metadata = { title: 'Center users' };
export default async function UsersPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const actor = await requirePageActor(),
    params = await searchParams;
  let initial = null,
    initialQuery = null,
    initialError = '',
    mappingIssues: null | number = null;
  try {
    const parsed = centerUserQuerySchema.safeParse(params);
    if (parsed.success) initialQuery = parsed.data;
    else {
      const options = await centerUserOptions(actor, { q: '', page: 1 });
      if (options.items[0])
        initialQuery = centerUserQuerySchema.parse({
          centerId: options.items[0].id,
          centerType: options.items[0].type,
        });
    }
    if (initialQuery) initial = await listCenterUsers(actor, initialQuery);
    mappingIssues = await legacyUserMappingIssues(actor);
  } catch {
    initialError = 'Unable to load center users. Retry or choose a center you can access.';
  }
  return (
    <CenterUsersDirectory
      initial={initial}
      initialQuery={initialQuery}
      initialError={initialError}
      mappingIssues={mappingIssues}
    />
  );
}
