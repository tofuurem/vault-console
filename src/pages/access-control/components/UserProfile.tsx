import {
  useEffect,
  useRef,
} from 'react';

import type {
  UserAccessReportActions,
  UserAccessReportResource,
} from '@/application/vault/useUserAccessReport';
import Button from '@/components/base/Button';
import AccessSourceSummary from './AccessSourceSummary';
import ReportCompleteness from './ReportCompleteness';

interface UserProfileProps {
  readonly resource: UserAccessReportResource;
  readonly actions: UserAccessReportActions;
  readonly onBack: () => void;
}

function identityStatus(resource: UserAccessReportResource): {
  readonly label: string;
  readonly classes: string;
} {
  const status = resource.identity.state.status;
  if (status === 'available') {
    return {
      label: resource.identity.state.entity.disabled ? 'Identity disabled' : 'Identity linked',
      classes: resource.identity.state.entity.disabled
        ? 'bg-danger-100 text-danger-800'
        : 'bg-success-100 text-success-800',
    };
  }
  if (status === 'absent') {
    return { label: 'No identity entity', classes: 'bg-background-200 text-foreground-600' };
  }
  if (status === 'denied') {
    return { label: 'Identity denied', classes: 'bg-danger-100 text-danger-800' };
  }
  return { label: 'Identity unavailable', classes: 'bg-warning-100 text-warning-900' };
}

function Metric({
  icon,
  label,
  value,
  detail,
}: {
  readonly icon: string;
  readonly label: string;
  readonly value: string | number;
  readonly detail: string;
}) {
  return (
    <div className="rounded-lg border border-background-200 bg-background-50 p-3">
      <div className="flex items-center justify-between gap-3">
        <p className="text-[10px] font-medium text-foreground-500">{label}</p>
        <i className={`${icon} text-sm text-foreground-400`} aria-hidden="true" />
      </div>
      <p className="mt-2 font-mono text-lg font-semibold tracking-tight text-foreground-900">
        {value}
      </p>
      <p className="mt-0.5 text-[10px] leading-4 text-foreground-400">{detail}</p>
    </div>
  );
}

function IdentityRow({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="grid gap-1 border-b border-background-200 py-2.5 last:border-0 sm:grid-cols-[150px_1fr]">
      <dt className="text-[10px] font-medium text-foreground-500">{label}</dt>
      <dd className="break-all font-mono text-[10px] text-foreground-800 sm:text-right">
        {value}
      </dd>
    </div>
  );
}

export default function UserProfile({
  resource,
  actions,
  onBack,
}: UserProfileProps) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const identity = identityStatus(resource);
  const resolvedSources = resource.report.sources.filter(
    (source) => source.resolution === 'resolved',
  ).length;
  const refreshing = resource.refreshing.account
    || resource.refreshing.identity
    || resource.refreshing.groups
    || resource.refreshing.policies.length > 0;
  const alias = resource.user.entity?.aliases.find(
    (candidate) => candidate.mountAccessor === resource.user.mountAccessor,
  );

  useEffect(() => {
    headingRef.current?.focus();
  }, [resource.report.account.mount, resource.report.account.username]);

  return (
    <section
      aria-labelledby="user-profile-heading"
      className="flex min-h-0 flex-1 flex-col bg-background-100/40"
    >
      <header className="shrink-0 border-b border-background-200 bg-background-50 px-4 py-3 sm:px-5">
        <div className="mx-auto flex max-w-[1480px] flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <div className="flex min-w-0 items-center gap-3">
            <Button size="sm" onClick={onBack} aria-label="Back to users">
              <i className="ri-arrow-left-line" aria-hidden="true" />
              <span className="hidden sm:inline">Users</span>
            </Button>
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary-200 bg-primary-100 font-mono text-sm font-semibold text-primary-700">
              {resource.user.displayName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2
                  ref={headingRef}
                  id="user-profile-heading"
                  tabIndex={-1}
                  className="truncate text-base font-semibold tracking-tight text-foreground-900 focus:outline-none"
                >
                  {resource.user.displayName}
                </h2>
                <span className={`rounded-full px-1.5 py-0.5 text-[9px] font-semibold ${identity.classes}`}>
                  {identity.label}
                </span>
              </div>
              <p className="mt-0.5 truncate font-mono text-[10px] text-foreground-500">
                auth/{resource.user.mount}/users/{resource.user.username}
              </p>
            </div>
          </div>
          <div className="w-full lg:max-w-xl">
            <ReportCompleteness
              completeness={resource.report.completeness}
              refreshing={refreshing}
              onRetry={actions.retryIncomplete}
            />
          </div>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1480px] space-y-5 p-4 sm:p-5">
          <section aria-label="User access overview">
            <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              <Metric
                icon="ri-database-2-line"
                label="Auth mount"
                value={`${resource.user.mount}/`}
                detail={`accessor ${resource.user.mountAccessor}`}
              />
              <Metric
                icon="ri-group-line"
                label="Identity groups"
                value={resource.report.groups.length}
                detail={resource.report.groups.length > 0
                  ? resource.report.groups.map((group) => group.name).join(', ')
                  : 'No readable memberships'}
              />
              <Metric
                icon="ri-shield-check-line"
                label="Resolved sources"
                value={resolvedSources}
                detail={`${resource.report.sources.length} total policy attachments`}
              />
              <Metric
                icon="ri-route-line"
                label="Policy paths"
                value={resource.report.targets.length}
                detail={resource.report.unresolvedSources.length > 0
                  ? `${resource.report.unresolvedSources.length} sources remain unresolved`
                  : 'All attached sources resolved'}
              />
            </div>
          </section>

          {resource.report.groups.length > 0 && (
            <section
              aria-labelledby="profile-groups-heading"
              className="rounded-lg border border-background-200 bg-background-50 p-3"
            >
              <div className="flex items-center gap-2">
                <i className="ri-node-tree text-sm text-secondary-600" aria-hidden="true" />
                <h2 id="profile-groups-heading" className="text-xs font-semibold text-foreground-800">
                  Identity memberships
                </h2>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {resource.report.groups.map((group) => (
                  <span
                    key={group.id}
                    className="rounded-md border border-secondary-200 bg-secondary-100 px-2 py-1 text-[10px] font-medium text-secondary-800"
                  >
                    {group.name}
                  </span>
                ))}
              </div>
            </section>
          )}

          <AccessSourceSummary
            resource={resource}
            onRetryPolicy={actions.retryPolicy}
          />

          <details className="rounded-lg border border-background-200 bg-background-50">
            <summary className="flex min-h-11 cursor-pointer select-none items-center gap-2 px-3 text-xs font-semibold text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400">
              <i className="ri-fingerprint-line text-sm text-foreground-500" aria-hidden="true" />
              Technical identity
            </summary>
            <dl className="border-t border-background-200 px-3">
              <IdentityRow
                label="Entity ID"
                value={resource.user.entity?.id ?? 'No identity entity'}
              />
              <IdentityRow label="Alias ID" value={alias?.id ?? 'No alias'} />
              <IdentityRow label="Mount accessor" value={resource.user.mountAccessor} />
              <IdentityRow
                label="Token policies"
                value={resource.user.tokenPolicies.join(', ') || 'None'}
              />
            </dl>
          </details>
        </div>
      </div>
    </section>
  );
}
