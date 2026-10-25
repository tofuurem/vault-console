import { useMemo } from 'react';

import { usePkiRoleDetails, usePkiRoles } from '@/application/engines/pki/usePkiQueries';
import Badge from '@/components/base/Badge';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { formatTtlSeconds } from '@/domain/engines/engines';
import { roleDomainSummary } from '@/domain/engines/pki/pki-helpers';
import { CARD_CLASS } from '../pki-format';
import { EmptyState, ErrorNotice } from './Notices';

/** Every role on the mount with a one-line description of what it allows. */
export default function RolesPanel({ mount, onOpen, onCreate }: {
  readonly mount: string;
  readonly onOpen: (name: string) => void;
  readonly onCreate: () => void;
}) {
  const roles = usePkiRoles(mount);
  const names = useMemo(() => roles.data ?? [], [roles.data]);
  const details = usePkiRoleDetails(mount, names);

  if (roles.isPending) return <ContentSkeleton variant="list" label="Loading roles" />;
  if (roles.isError) {
    return <ErrorNotice title="Roles could not be listed" error={roles.error} permissionHint={`Your token needs list on ${mount}/roles.`} />;
  }
  if (names.length === 0) {
    return (
      <EmptyState
        icon="ri-file-shield-2-line"
        title="No roles yet"
        action={<Button size="sm" variant="primary" onClick={onCreate}>Create role</Button>}
      >
        Certificates are always issued through a role. A role sets the allowed names, key type, and lifetime, for
        example a <span className="font-mono">web-server</span> role for <span className="font-mono">*.example.com</span>.
      </EmptyState>
    );
  }
  return (
    <ul aria-label="Roles" className={`${CARD_CLASS} divide-y divide-background-200 overflow-hidden`}>
      {names.map((name) => {
        const detail = details.get(name);
        const role = detail?.status === 'success' ? detail.data : undefined;
        return (
          <li key={name}>
            <button
              type="button"
              onClick={() => onOpen(name)}
              className="flex min-h-11 w-full items-center gap-3 px-3 py-2 text-left transition-colors hover:bg-background-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
            >
              <i className="ri-file-shield-2-line text-sm text-primary-600" aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-mono text-xs font-medium text-foreground-900">{name}</span>
                <span className="mt-0.5 block truncate text-[11px] text-foreground-500">
                  {role ? roleDomainSummary(role) : detail?.status === 'error' ? 'Details unavailable' : 'Loading…'}
                </span>
              </span>
              {role && (
                <span className="hidden items-center gap-1.5 text-[11px] text-foreground-600 sm:flex">
                  <Badge>{role.keyType === 'any' ? 'Any key' : role.keyType.toUpperCase()}</Badge>
                  <span className="tabular-nums">max {formatTtlSeconds(role.maxTtlSeconds)}</span>
                </span>
              )}
              <i className="ri-arrow-right-s-line text-foreground-400" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
