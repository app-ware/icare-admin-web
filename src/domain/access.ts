import { centerKey, type CenterRef } from './centers';

export const permissions = [
  'centers.read',
  'centers.write',
  'centers.create',
  'users.manage',
  'dealers.manage',
  'status.read',
  'status.manage',
  'payments.read',
  'payments.write',
  'reports.read',
  'reports.export',
  'alerts.read',
  'alerts.write',
  'alerts.reset',
  'transport.manage',
  'integrations.manage',
  'audit.read',
] as const;
export type Permission = (typeof permissions)[number];
export type Grant = {
  permission: Permission;
  scope: { kind: 'global' } | { kind: 'centers'; keys: readonly string[] };
};
export interface Principal {
  subject: string;
  dealerId: number;
  active: boolean;
  expiresAt: number;
  grants: readonly Grant[];
}

export interface PortalActor extends Principal {
  mode: 'legacy' | 'preview';
  name: string;
  username: string;
  isSuperAdmin: boolean;
  sessionId: string;
}

// Feature grants never depend on numeric dealer-ID exceptions. Pending modules stay denied.
export function centerGrants(
  isSuperAdmin: boolean,
  ownedKeys: readonly string[],
  reportKeys: readonly string[] = [],
  statusKeys: readonly string[] = [],
  alertKeys: readonly string[] = [],
): Grant[] {
  const scope: Grant['scope'] = isSuperAdmin
    ? { kind: 'global' }
    : { kind: 'centers', keys: ownedKeys };
  const grants: Grant[] = [
    { permission: 'centers.read', scope },
    { permission: 'centers.write', scope },
    { permission: 'centers.create', scope: { kind: 'global' } },
    { permission: 'users.manage', scope },
    { permission: 'transport.manage', scope },
    { permission: 'status.manage', scope },
    { permission: 'alerts.write', scope },
    {
      permission: 'alerts.read',
      scope: isSuperAdmin
        ? { kind: 'global' }
        : { kind: 'centers', keys: [...new Set([...ownedKeys, ...alertKeys])] },
    },
    {
      permission: 'status.read',
      scope: isSuperAdmin
        ? { kind: 'global' }
        : { kind: 'centers', keys: [...new Set([...ownedKeys, ...statusKeys])] },
    },
  ];
  const reportScope: Grant['scope'] = isSuperAdmin
    ? { kind: 'global' }
    : {
        kind: 'centers',
        keys: [
          ...new Set([...ownedKeys, ...reportKeys.filter((key) => /^[1-9]\d*_(1|3)$/.test(key))]),
        ],
      };
  grants.push(
    { permission: 'reports.read', scope: reportScope },
    { permission: 'reports.export', scope: reportScope },
  );
  if (isSuperAdmin)
    grants.push(
      { permission: 'dealers.manage', scope: { kind: 'global' } },
      { permission: 'alerts.reset', scope: { kind: 'global' } },
    );
  return grants;
}
function validPrincipal(principal: Principal | null): principal is Principal {
  return Boolean(
    principal?.active &&
    principal.subject &&
    Number.isInteger(principal.dealerId) &&
    principal.dealerId > 0 &&
    Number.isFinite(principal.expiresAt) &&
    principal.expiresAt > Date.now(),
  );
}
export function hasPermission(
  principal: Principal | null,
  permission: Permission,
  center?: CenterRef,
  now = Date.now(),
): boolean {
  if (
    !principal?.active ||
    !principal.subject ||
    !Number.isInteger(principal.dealerId) ||
    principal.dealerId <= 0 ||
    !Number.isFinite(principal.expiresAt) ||
    principal.expiresAt <= now
  )
    return false;
  let key: string | undefined;
  try {
    key = center ? centerKey(center) : undefined;
  } catch {
    return false;
  }
  return principal.grants.some(
    (grant) =>
      grant.permission === permission &&
      (grant.scope.kind === 'global' || (key !== undefined && grant.scope.keys.includes(key))),
  );
}
export class AccessDeniedError extends Error {
  constructor() {
    super('Access denied');
    this.name = 'AccessDeniedError';
  }
}
export function assertCapability(principal: Principal | null, permission: Permission) {
  // Directory access checks capability and identity; each returned resource still needs scope.
  if (!validPrincipal(principal) || !principal.grants.some((g) => g.permission === permission))
    throw new AccessDeniedError();
}
export function assertPermission(
  principal: Principal | null,
  permission: Permission,
  center?: CenterRef,
): asserts principal is Principal {
  if (!hasPermission(principal, permission, center)) throw new AccessDeniedError();
}
