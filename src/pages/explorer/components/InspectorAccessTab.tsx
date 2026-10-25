import { useSecretAccess } from '@/application/vault/useSecretAccess';
import type {
  SecretAccessCapability,
  SecretAccessGap,
  SecretAccessReport,
  SecretAccessSubject,
  SecretAccessVia,
} from '@/domain/access-control/secret-access';
import type { VaultSession } from '@/domain/vault/contracts';
import { secretLogicalPath } from '@/domain/vault/secret-export';
import { InspectorListSkeleton } from './InspectorSkeleton';

interface InspectorAccessTabProps {
  readonly session: VaultSession;
  readonly mount: string;
  readonly path: string;
}

const CAPABILITY_LABELS: Readonly<Record<SecretAccessCapability, string>> = {
  read: 'Read',
  write: 'Write',
  delete: 'Delete',
  list: 'List',
  destroy: 'Destroy',
};

const CAPABILITY_HINTS: Readonly<Record<SecretAccessCapability, string>> = {
  read: 'Can read secret data',
  write: 'Can create or update versions',
  delete: 'Can soft-delete versions',
  list: 'Can see this key when listing its folder',
  destroy: 'Can permanently destroy versions',
};

const CAPABILITY_CLASSES: Readonly<Record<SecretAccessCapability, string>> = {
  read: 'border-primary-200 bg-primary-50 text-primary-700',
  write: 'border-warning-200 bg-warning-50 text-warning-800',
  delete: 'border-danger-200 bg-danger-50 text-danger-700',
  list: 'border-background-300 bg-background-100 text-foreground-700',
  destroy: 'border-danger-300 bg-danger-100 text-danger-800',
};

const SECTIONS = [
  { key: 'users', title: 'Users', icon: 'ri-user-line' },
  { key: 'groups', title: 'Groups', icon: 'ri-group-line' },
  { key: 'roles', title: 'Roles', icon: 'ri-shield-user-line' },
] as const;

function describeAccessVia(via: SecretAccessVia): string {
  if (via.kind === 'policy') return `policy ${via.policyName}`;
  if (via.kind === 'role') return `role ${via.roleName}`;
  return `group ${via.groupName} · ${via.roleName ? `role ${via.roleName}` : `policy ${via.policyName}`}`;
}

function describeAccessGap(gap: SecretAccessGap): string {
  switch (gap.source) {
    case 'auth-mounts':
      return 'Auth methods could not be listed, so userpass users are missing.';
    case 'userpass-mount':
      return `Users at auth/${gap.id} could not be listed.`;
    case 'groups':
      return 'Identity groups could not be read, so access through groups is missing.';
    case 'entities':
      return 'Identities could not be read, so identity policies and group membership of users are missing.';
    case 'policy-list':
      return 'The policy list could not be read, so roles that nobody uses yet may be missing.';
    case 'policy':
      if (gap.reason === 'unsupported') return `Policy ${gap.id} uses rules the console cannot evaluate.`;
      return gap.reason === 'denied'
        ? `Policy ${gap.id} is not readable with your token.`
        : `Policy ${gap.id} could not be loaded.`;
  }
}

function subjectIncompleteReason(subject: SecretAccessSubject): string | undefined {
  if (subject.unresolvedPolicies.length > 0) {
    const names = subject.unresolvedPolicies.join(', ');
    return `May have more access: ${subject.unresolvedPolicies.length === 1 ? 'policy' : 'policies'} ${names} could not be checked.`;
  }
  if (subject.membershipUnknown) return 'May have more access: identity or group membership could not be read.';
  return undefined;
}

function CapabilityChips({ capabilities }: { readonly capabilities: readonly SecretAccessCapability[] }) {
  return (
    <ul className="flex flex-wrap gap-1" aria-label="Capabilities">
      {capabilities.map((capability) => (
        <li
          key={capability}
          title={CAPABILITY_HINTS[capability]}
          className={`rounded border px-1.5 py-px text-[10px] font-medium ${CAPABILITY_CLASSES[capability]}`}
        >
          {CAPABILITY_LABELS[capability]}
        </li>
      ))}
    </ul>
  );
}

function SubjectRow({ subject }: { readonly subject: SecretAccessSubject }) {
  const incomplete = subjectIncompleteReason(subject);
  return (
    <li className="space-y-1 px-2.5 py-2">
      <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <span className="break-all font-mono text-xs font-medium text-foreground-800">{subject.label}</span>
          {subject.detail && <span className="ml-1.5 break-all text-[10px] text-foreground-500">{subject.detail}</span>}
        </div>
        <CapabilityChips capabilities={subject.capabilities} />
      </div>
      {subject.via.length > 0 && (
        <p className="break-words text-[10px] leading-4 text-foreground-500">
          via {subject.via.map(describeAccessVia).join(', ')}
        </p>
      )}
      {incomplete && (
        <p className="flex items-start gap-1 text-[10px] leading-4 text-warning-700">
          <i className="ri-error-warning-line mt-px" aria-hidden="true" />
          <span>{incomplete}</span>
        </p>
      )}
    </li>
  );
}

function CompletenessNotice({ report }: { readonly report: SecretAccessReport }) {
  if (report.completeness.state === 'complete') return null;
  const { unverified } = report;
  return (
    <div role="status" className="rounded-md border border-warning-200 bg-warning-50 p-3 text-xs text-warning-800">
      <p className="font-semibold">Some access could not be checked</p>
      <p className="mt-1 leading-5">The list below is a minimum. Vault may grant access that is not shown.</p>
      <ul className="mt-1.5 list-disc space-y-0.5 pl-4 leading-5">
        {report.completeness.gaps.map((gap) => (
          <li key={`${gap.source}:${'id' in gap ? gap.id : ''}`}>{describeAccessGap(gap)}</li>
        ))}
      </ul>
      {unverified.length > 0 && (
        <details className="mt-2">
          <summary className="cursor-pointer font-medium">
            {unverified.length} {unverified.length === 1 ? 'subject' : 'subjects'} could not be checked
          </summary>
          <ul className="mt-1 space-y-0.5 pl-1">
            {unverified.map((subject) => (
              <li key={`${subject.kind}:${subject.id}`} className="break-all font-mono text-[11px]">
                {subject.kind} {subject.label}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}

function AccessReport({ report }: { readonly report: SecretAccessReport }) {
  const empty = SECTIONS.every((section) => report[section.key].length === 0);
  return (
    <>
      <CompletenessNotice report={report} />
      {empty ? (
        <p className="rounded-md border border-background-200 bg-background-100 p-3 text-xs leading-5 text-foreground-600">
          No users, groups, or roles in the policies the console can read have access to this secret.
        </p>
      ) : SECTIONS.map((section) => report[section.key].length > 0 && (
        <section key={section.key} aria-label={section.title}>
          <h3 className="mb-1 flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-foreground-500">
            <i className={`${section.icon} text-xs`} aria-hidden="true" />
            {section.title}
            <span className="rounded-full bg-background-200 px-1.5 text-[10px] font-medium normal-case tracking-normal text-foreground-600">
              {report[section.key].length}
            </span>
          </h3>
          <ul className="divide-y divide-background-100 overflow-hidden rounded-md border border-background-200">
            {report[section.key].map((subject) => <SubjectRow key={subject.id} subject={subject} />)}
          </ul>
        </section>
      ))}
    </>
  );
}

export default function InspectorAccessTab({ session, mount, path }: InspectorAccessTabProps) {
  const { state, refreshing, refresh } = useSecretAccess(session, mount, path, true);
  if (state.status === 'idle' || state.status === 'loading') {
    return <InspectorListSkeleton label="Loading access" />;
  }
  if (state.status === 'error' && !state.data) {
    return (
      <div className="p-3">
        <div role="alert" className="rounded-md border border-warning-200 bg-warning-50 p-3 text-xs text-warning-800">
          <p className="font-semibold">Access could not be checked</p>
          <p className="mt-1 leading-5">{state.error.message}</p>
          <button type="button" onClick={refresh} className="mt-2 min-h-11 font-medium text-warning-900 underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-0">Retry</button>
        </div>
      </div>
    );
  }
  return (
    <div className="space-y-3 p-3" aria-busy={refreshing}>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[11px] font-medium text-foreground-700">Who can access this secret</p>
          <p className="break-all font-mono text-[10px] text-foreground-500">{secretLogicalPath(mount, path)}</p>
        </div>
        <button
          type="button"
          aria-label="Refresh access"
          onClick={refresh}
          disabled={refreshing}
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50 sm:h-7 sm:w-7"
        >
          <i className={`ri-refresh-line ${refreshing ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
        </button>
      </div>
      {state.data && <AccessReport report={state.data} />}
      <p className="text-[10px] leading-4 text-foreground-400">
        Based on userpass users, identity groups, and policies the console can read. Tokens created another way are not included; Vault makes the final decision.
      </p>
    </div>
  );
}
