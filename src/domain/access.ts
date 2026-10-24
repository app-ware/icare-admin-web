import { centerKey, type CenterRef } from './centers';

export const permissions = [
  'centers.read',
  'centers.write',
  'centers.create',
  'users.manage',
  'dealers.manage',
  'status.manage',
  'payments.read',
  'payments.write',
  'reports.read',
  'reports.export',
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

// These are feature grants, not numeric dealer-ID exceptions. Future modules stay disabled.
export function centerGrants(
  isSuperAdmin: boolean,
  ownedKeys: readonly string[],
  reportKeys: readonly string[] = [],
): Grant[] {
  const scope: Grant['scope'] = isSuperAdmin
    ? { kind: 'global' }
    : { kind: 'centers', keys: ownedKeys };
  const grants: Grant[] = [
    { permission: 'centers.read', scope },
    { permission: 'centers.write', scope },
    { permission: 'centers.create', scope: { kind: 'global' } },
    { permission: 'users.manage', scope },
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
  if (isSuperAdmin) grants.push({ permission: 'dealers.manage', scope: { kind: 'global' } });
  return grants;
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
export function assertPermission(
  principal: Principal | null,
  permission: Permission,
  center?: CenterRef,
): asserts principal is Principal {
  if (!hasPermission(principal, permission, center)) throw new AccessDeniedError();
}
