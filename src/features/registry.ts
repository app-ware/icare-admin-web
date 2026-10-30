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
      'Upload and review a private portal logo and main center photo before publishing',
      'Create a center with a guided profile, branding, location, and administrator review',
      'Save and resume an owned draft with its private logo and center photo',
      'Upload, review, replace and remove a private PNG watermark on centers and drafts',
      'Edit profile, child input mode, photos, and coordinates',
      'Choose a location by map click, draggable pin or synchronized manual coordinates',
      'Track provisioning and QR generation progress',
      'Review input-mode changes and prepare resumable private demo QR jobs',
    ],
    acceptance: [
      'Keep center ID and type together',
      'Decode and re-encode bounded images, preserve current branding until publish, and scope preview access by owner and mode',
      'Validate drafts and recover partial provisioning',
      'Attach draft images with the profile revision; transfer images atomically on demo creation only',
      'Require both watermark dimensions to be 1024 pixels, preserve alpha and retain revisions after removal',
      'Load external tiles only after an explicit choice; map navigation never changes saved coordinates',
      'Confirm authorized actor before every update',
      'Keep live QR blocked until scanner/storage acceptance; recheck job ownership and current center scope for every image',
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
      'Show zero activity, unresolved history and calculation assumptions separately',
    ],
    acceptance: [
      'Use versioned legacy Excel ranges: 1–5, 6–13 and 14+ days',
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
      'Filter authorized centers by name, type, status and assigned dealer for administrators',
      'Select up to 20 Nursery/Lite centers, including inactive centers',
      'Export center/class aggregates and counting rules; School uses a separate academic-year workbook',
      'Review own generation history and regenerate under current permissions',
    ],
    acceptance: [
      'Use the correct school or nursery data source',
      'Conserve demo/non-demo totals and distinguish unique center counts from class membership',
      'Recheck access before delivering memory-only XLSX workbooks without child details',
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
    permission: 'alerts.read',
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
      'Use an inclusive UTC calendar expiry date',
      'Keep page-8 grants read-only and reset administrator-only',
      'Persist owned idempotent batch results and never replay confirmed or unconfirmed targets',
    ],
  },
  {
    id: 'status',
    label: 'Center status',
    group: 'Operations',
    permission: 'status.read',
    description:
      'Review center activation and make scoped, revision-checked status changes with portal history.',
    legacyPages: ['CenterStatus.aspx', 'CenterCowPay.aspx'],
    workflows: [
      'Filter activation status and dealer',
      'Review the selected center',
      'Activate or deactivate with confirmation',
      'Track who changed status and when',
      'Read existing page-9 status grants without granting write access',
    ],
    acceptance: [
      'Separate status from gateway enablement',
      'Recheck access when saving',
      'Handle concurrent status changes',
      'Keep missing status explicit, block ambiguous records and use a separate status-write switch',
      'Keep portal change receipts separate from the pending legacy Logging integration',
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
      'Reject duplicate settings, stale revisions and missing catalog choices; never edit global defaults',
      'Keep live bus changes behind a separate write switch and local receipts separate from Logging',
    ],
  },
  {
    id: 'integrations',
    label: 'CowPay readiness',
    group: 'Administration',
    permission: 'integrations.read',
    description: 'Review scoped stored gateway setup without exposing credentials.',
    legacyPages: ['CenterCowPaySettings.aspx'],
    workflows: [
      'Find configured and unconfigured centers',
      'Review independent live and staging credential-presence status',
      'Flag duplicate settings, mismatched center types and unknown enablement',
      'Review an explicitly configured callback address; secret replacement and enablement remain pending',
    ],
    acceptance: [
      'Expose configured state rather than secret values',
      'Require current owner/admin composite scope; keep School unsupported and writes denied',
      'Display only an explicitly reviewed callback; no provider or callback requests',
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
