import type { Permission } from '@/domain/access';

export interface PortalModule {
  id: string;
  label: string;
  description: string;
  group: 'Workspace' | 'Operations' | 'Administration';
  permission: Permission;
  legacyPages: readonly string[];
  workflows: readonly string[];
  acceptance: readonly string[];
}
export const modules = [
  {
    id: 'centers',
    label: 'Care centers',
    group: 'Workspace',
    permission: 'centers.read',
    description: 'One place for every center, its profile, branding, and settings.',
    legacyPages: [
      'CareCenterInfo.aspx',
      'SelectPhotos.aspx',
      'SelectLocation.aspx',
      'Summary.aspx',
      'SelectCenter.aspx',
      'EditCenterList.aspx',
      'ManageCareCenter.aspx',
      'EditSummary.aspx',
      'EditPhotos.aspx',
      'EditLocation.aspx',
    ],
    workflows: [
      'Find and filter authorized centers',
      'Create a center with a guided profile, branding, location, and administrator review',
      'Edit profile, child input mode, photos, and coordinates',
      'Track provisioning and QR generation progress',
    ],
    acceptance: [
      'Keep center ID and type together',
      'Validate drafts and recover partial provisioning',
      'Confirm authorized actor before every update',
    ],
  },
  {
    id: 'users',
    label: 'Center users',
    group: 'Workspace',
    permission: 'users.manage',
    description:
      'Review existing center users, edit their profiles and manage secure sign-in status.',
    legacyPages: ['AddUser.aspx', 'SelectUser.aspx', 'ManageUser.aspx', 'UserSummary.aspx'],
    workflows: [
      'Search users within an authorized center',
      'Update existing names and email with review and conflict protection',
      'Review local roles and secure account mappings',
      'Manage secure sign-in status; creation and password resets remain pending',
    ],
    acceptance: [
      'Never display or read back a password',
      'Keep usernames, passwords and role assignments unchanged',
      'Verify the user belongs to the selected center',
      'Block ambiguous mappings and protect the last linked active administrator',
    ],
  },
  {
    id: 'activity',
    label: 'Class activity',
    group: 'Workspace',
    permission: 'reports.read',
    description: 'Understand class usage across nursery months and school years.',
    legacyPages: ['CenterActivity.aspx', 'ClassChildrenActivity.aspx'],
    workflows: [
      'Choose center and month or academic year',
      'Compare active-day buckets and demo accounts',
      'View class breakdowns',
      'Export selected centers with progress and download history',
    ],
    acceptance: [
      'Agree the five-day boundary before live use',
      'Characterize no-transaction and leap-month cases',
      'Separate exporting from invoice tracking',
    ],
  },
  {
    id: 'reports',
    label: 'Center reports',
    group: 'Workspace',
    permission: 'reports.export',
    description: 'Build consistent center summaries and downloadable reports.',
    legacyPages: ['CenterReport.aspx'],
    workflows: [
      'Filter centers by dealer and reporting month',
      'Include inactive centers when required',
      'Exclude centers with no qualifying activity',
      'Export non-demo activity above thirteen days',
    ],
    acceptance: [
      'Use the correct school or nursery data source',
      'Match approved historical report fixtures',
      'Authorize downloads and expire generated files',
    ],
  },
  {
    id: 'payments',
    label: 'Payments',
    group: 'Operations',
    permission: 'payments.read',
    description: 'A clear ledger of center payments, due dates, and status.',
    legacyPages: ['CenterPayments.aspx'],
    workflows: [
      'Filter by center, status, and due date',
      'Create and edit payment records',
      'Review exact totals separately for each currency',
      'Confirm deletion and record its outcome',
    ],
    acceptance: [
      'Preserve decimal values',
      'Show success only after confirmed persistence',
      'Authorize every payment’s center and type',
    ],
  },
  {
    id: 'alerts',
    label: 'Alert messages',
    group: 'Operations',
    permission: 'alerts.write',
    description: 'Publish time-limited messages to one center or a selected group.',
    legacyPages: ['CenterAlertMessage.aspx'],
    workflows: [
      'Filter centers and select recipients',
      'Preview message and expiry',
      'Publish to one or multiple centers',
      'Reset alerts with a separate permission',
    ],
    acceptance: [
      'Reject an empty recipient list',
      'Show individual results for partial success',
      'Use a defined expiry timezone and date policy',
    ],
  },
  {
    id: 'status',
    label: 'Center status',
    group: 'Operations',
    permission: 'status.manage',
    description: 'Manage center availability with clear, audited controls.',
    legacyPages: ['CenterStatus.aspx', 'CenterCowPay.aspx'],
    workflows: [
      'Filter activation status and dealer',
      'Review the selected center',
      'Activate or deactivate with confirmation',
      'Track who changed status and when',
    ],
    acceptance: [
      'Separate status from gateway enablement',
      'Recheck access when saving',
      'Handle concurrent status changes',
    ],
  },
  {
    id: 'transport',
    label: 'Bus settings',
    group: 'Operations',
    permission: 'transport.manage',
    description: 'Configure each bus’s arrival and passenger input settings.',
    legacyPages: ['iCareBusSettings.aspx'],
    workflows: [
      'Select center and bus',
      'Review inherited or bus-specific settings',
      'Choose geofence radius, dwell duration, and input mode',
      'Save validated settings and show the confirmed result',
    ],
    acceptance: [
      'Verify bus belongs to the center',
      'Read reference values and units from the correct database',
      'Label inherited defaults clearly',
    ],
  },
  {
    id: 'integrations',
    label: 'CowPay settings',
    group: 'Administration',
    permission: 'integrations.manage',
    description: 'Manage center gateway configuration and environment readiness.',
    legacyPages: ['CenterCowPaySettings.aspx'],
    workflows: [
      'Find configured and unconfigured centers',
      'Review live and staging setup status',
      'Replace credentials through a protected flow',
      'Enable the integration and review its callback address',
    ],
    acceptance: [
      'Expose configured state rather than secret values',
      'Verify callback ownership before integration',
      'Audit credential changes without recording secrets',
    ],
  },
  {
    id: 'dealers',
    label: 'Dealers',
    group: 'Administration',
    permission: 'dealers.manage',
    description:
      'Create and manage dealer accounts, account status, administrator roles and center assignments.',
    legacyPages: ['AddDealer.aspx', 'SelectDealer.aspx', 'ManageDealer.aspx'],
    workflows: [
      'Find and create dealer accounts',
      'Update account details',
      'Assign centers and administrator access with a confirmation review',
      'Enable or disable accounts and invalidate changed access sessions',
    ],
    acceptance: [
      'Replace individual-ID exceptions with named grants',
      'Apply authorization on every request',
      'Keep calling actor separate from target dealer',
      'Prevent self lockout and preserve an active administrator',
      'Reject stale edits and duplicate usernames without exposing credentials',
    ],
  },
  {
    id: 'access',
    label: 'Access & identity',
    group: 'Administration',
    permission: 'audit.read',
    description: 'A secure sign-in and permission model for the new portal.',
    legacyPages: ['login.aspx'],
    workflows: [
      'Sign in through the selected identity provider',
      'Use MFA for privileged access',
      'Apply center-scoped capabilities',
      'Revoke and expire sessions consistently',
    ],
    acceptance: [
      'Never trust browser-supplied roles',
      'Default to denied when identity is unavailable',
      'Verify legacy credential compatibility before migration',
    ],
  },
] as const satisfies readonly PortalModule[];
export function findModule(id: string): PortalModule | undefined {
  return modules.find((module) => module.id === id);
}
