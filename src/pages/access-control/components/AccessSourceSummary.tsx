import type { UserAccessReportResource } from '@/application/vault/useUserAccessReport';
import { managedRoleName } from '@/domain/access-control/managed-resources';
import type {
  UserAccessPolicyStatus,
  UserAccessReportSource,
} from '@/domain/access-control/user-access-report';

interface AccessSourceSummaryProps {
  readonly resource: UserAccessReportResource;
  readonly onRetryPolicy: (policyName: string) => void;
}

interface SourceSection {
  readonly key: string;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly sources: readonly UserAccessReportSource[];
}

const STATUS_PRESENTATION: Record<UserAccessPolicyStatus, {
  readonly label: string;
  readonly classes: string;
}> = {
  resolved: {
    label: 'Resolved',
    classes: 'bg-success-100 text-success-800',
  },
  external: {
    label: 'External HCL',
    classes: 'bg-warning-100 text-warning-900',
  },
  unreadable: {
    label: 'Unreadable',
    classes: 'bg-warning-100 text-warning-900',
  },
  missing: {
    label: 'Missing',
    classes: 'bg-danger-100 text-danger-800',
  },
  unsupported: {
    label: 'Unsupported',
    classes: 'bg-warning-100 text-warning-900',
  },
  denied: {
    label: 'Denied',
    classes: 'bg-danger-100 text-danger-800',
  },
};

function retryable(status: UserAccessPolicyStatus): boolean {
  return status === 'denied' || status === 'missing' || status === 'unreadable';
}

function sourceSections(
  sources: readonly UserAccessReportSource[],
): readonly SourceSection[] {
  const sections: readonly Omit<SourceSection, 'sources'>[] = [
    {
      key: 'direct-roles',
      label: 'Direct roles',
      description: 'Managed roles attached directly to the account or entity.',
      icon: 'ri-shield-check-line',
    },
    {
      key: 'group-access',
      label: 'Group access',
      description: 'Policies and roles inherited through Identity groups.',
      icon: 'ri-group-line',
    },
    {
      key: 'per-user',
      label: 'Per-user policies',
      description: 'Console-managed rules scoped directly to this user.',
      icon: 'ri-user-settings-line',
    },
    {
      key: 'other',
      label: 'Other policies',
      description: 'Vault-native or externally managed policy sources.',
      icon: 'ri-file-code-line',
    },
  ];
  return sections.map((section) => ({
    ...section,
    sources: sources.filter((source) => {
      if (section.key === 'group-access') return source.origin.kind === 'group';
      if (source.origin.kind === 'group') return false;
      if (section.key === 'direct-roles') return source.policyKind === 'role';
      if (section.key === 'per-user') return source.policyKind === 'user-direct';
      return source.policyKind === 'external';
    }),
  }));
}

function provenance(source: UserAccessReportSource): string {
  if (source.origin.kind === 'group') {
    return source.policyKind === 'role'
      ? `${source.origin.groupName} → ${managedRoleName(source.policyName)} → ${source.policyName}`
      : `${source.origin.groupName} → ${source.policyName}`;
  }
  if (source.policyKind === 'role') {
    return `${managedRoleName(source.policyName)} → ${source.policyName}`;
  }
  if (source.policyKind === 'user-direct') {
    return `User rule → ${source.policyName}`;
  }
  return `Direct policy → ${source.policyName}`;
}

export default function AccessSourceSummary({
  resource,
  onRetryPolicy,
}: AccessSourceSummaryProps) {
  const policiesByName = new Map(
    resource.policies.map((policy) => [policy.name, policy]),
  );
  const sections = sourceSections(resource.report.sources);

  return (
    <section aria-labelledby="access-sources-heading">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
            Provenance
          </p>
          <h2 id="access-sources-heading" className="mt-0.5 text-sm font-semibold text-foreground-900">
            Access sources
          </h2>
        </div>
        <span className="font-mono text-[10px] text-foreground-400">
          {resource.report.sources.length} attachment{resource.report.sources.length === 1 ? '' : 's'}
        </span>
      </div>

      <div className="mt-3 grid gap-3 xl:grid-cols-2">
        {sections.map((section) => (
          <section
            key={section.key}
            aria-labelledby={`source-section-${section.key}`}
            className="overflow-hidden rounded-lg border border-background-200 bg-background-50"
          >
            <header className="flex items-start gap-2.5 border-b border-background-200 bg-background-100/70 px-3 py-2.5">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-background-200 text-foreground-600">
                <i className={section.icon} aria-hidden="true" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 id={`source-section-${section.key}`} className="text-xs font-semibold text-foreground-800">
                    {section.label}
                  </h3>
                  <span className="font-mono text-[9px] text-foreground-400">
                    {section.sources.length}
                  </span>
                </div>
                <p className="mt-0.5 text-[10px] leading-4 text-foreground-500">
                  {section.description}
                </p>
              </div>
            </header>

            {section.sources.length === 0 ? (
              <p className="px-3 py-4 text-center text-[11px] text-foreground-400">
                No attached sources
              </p>
            ) : (
              <ul className="divide-y divide-background-100">
                {section.sources.map((source, index) => {
                  const status = STATUS_PRESENTATION[source.resolution];
                  const policy = policiesByName.get(source.policyName);
                  const refreshing = resource.refreshing.policies.includes(source.policyName);
                  return (
                    <li
                      key={`${source.policyName}:${source.origin.kind}:${index}`}
                      className="px-3 py-2.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate font-mono text-[11px] font-medium text-foreground-800">
                            {source.policyName}
                          </p>
                          <p className="mt-1 break-words text-[10px] leading-4 text-foreground-500">
                            {provenance(source)}
                          </p>
                        </div>
                        <div className="flex shrink-0 items-center gap-1">
                          <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${status.classes}`}>
                            {status.label}
                          </span>
                          {retryable(source.resolution) && (
                            <button
                              type="button"
                              aria-label={`Retry policy ${source.policyName}`}
                              onClick={() => onRetryPolicy(source.policyName)}
                              disabled={refreshing}
                              className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-500 hover:bg-background-100 hover:text-foreground-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:cursor-wait disabled:opacity-50"
                            >
                              <i
                                className={refreshing ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'}
                                aria-hidden="true"
                              />
                            </button>
                          )}
                        </div>
                      </div>
                      {source.resolution === 'external' && policy?.hcl && (
                        <details className="mt-2 rounded-md border border-background-200 bg-background-100">
                          <summary className="min-h-9 cursor-pointer select-none px-2.5 py-2 text-[10px] font-medium text-foreground-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400">
                            View raw HCL
                          </summary>
                          <pre className="max-h-48 overflow-auto border-t border-background-200 p-2.5 font-mono text-[10px] leading-4 text-foreground-700">
                            {policy.hcl}
                          </pre>
                        </details>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        ))}
      </div>
    </section>
  );
}
