import { Link } from 'react-router-dom';

import type { AuthenticatedShellContextValue } from '@/app/authenticated-shell';
import type { NavigationPath } from '@/application/navigation-history/navigation-history';
import Button from '@/components/base/Button';
import Skeleton from '@/components/base/Skeleton';
import { explorerRoute } from '@/router/explorer-route';
import { formatDateTime, formatRelativeTime } from '@/shared/format/date-time';
import { navigationPathRoute } from '../home-routes';
import { EmptyNote, HOME_FOCUS_RING, HomeCard } from './HomeCard';

const MAX_LISTED_PATHS = 8;
const LIST_LINK = `flex min-h-11 items-center gap-2 rounded-md px-2 text-xs text-foreground-700 hover:bg-background-100 hover:text-foreground-900 sm:min-h-9 ${HOME_FOCUS_RING}`;

export function MountsCard({
  mountsState,
  refreshMounts,
}: AuthenticatedShellContextValue) {
  const mounts = mountsState.data ?? [];
  let content;
  if (mountsState.status === 'loading' && !mountsState.data) {
    content = (
      <div aria-busy="true" aria-label="Loading KV mounts" className="space-y-2">
        {[0, 1, 2].map((row) => <Skeleton key={row} className="h-8 w-full" />)}
      </div>
    );
  } else if (mountsState.status === 'error' && !mountsState.data) {
    content = (
      <div role="alert" className="text-xs text-warning-800">
        <p className="font-medium">KV mounts could not be loaded</p>
        <p className="mt-1 leading-5">{mountsState.error.message}</p>
        <Button size="sm" className="mt-3" onClick={refreshMounts}>Try again</Button>
      </div>
    );
  } else if (mounts.length === 0) {
    content = (
      <EmptyNote icon="ri-folder-shield-2-line" title="No KV v2 mounts are visible">
        Vault only lists mounts this token can see. Ask an administrator if one is missing.
      </EmptyNote>
    );
  } else {
    content = (
      <ul className="-mx-2 space-y-0.5">
        {mounts.map((mount) => (
          <li key={mount.path}>
            <Link to={explorerRoute(mount.path)} className={LIST_LINK}>
              <i className="ri-folder-keyhole-line text-sm text-foreground-400" aria-hidden="true" />
              <span className="font-mono font-medium">{mount.path}/</span>
              {mount.description && (
                <span className="min-w-0 flex-1 truncate text-foreground-500">{mount.description}</span>
              )}
            </Link>
          </li>
        ))}
      </ul>
    );
  }
  return (
    <HomeCard
      title="KV mounts"
      icon="ri-database-2-line"
      action={mounts.length > 0 ? <span className="text-[11px] tabular-nums text-foreground-400">{mounts.length}</span> : undefined}
    >
      {content}
    </HomeCard>
  );
}

interface PathListCardProps {
  readonly title: string;
  readonly icon: string;
  readonly paths: readonly (NavigationPath & { readonly visitedAt?: number })[];
  readonly emptyTitle: string;
  readonly emptyText: string;
}

export function PathListCard({ title, icon, paths, emptyTitle, emptyText }: PathListCardProps) {
  return (
    <HomeCard title={title} icon={icon}>
      {paths.length === 0 ? (
        <EmptyNote icon={icon} title={emptyTitle}>{emptyText}</EmptyNote>
      ) : (
        <ul className="-mx-2 space-y-0.5">
          {paths.slice(0, MAX_LISTED_PATHS).map((path) => {
            const logicalPath = `${path.mount}/${path.path}`;
            return (
              <li key={`${path.kind}:${logicalPath}`}>
                <Link to={navigationPathRoute(path)} className={LIST_LINK}>
                  <i className={`${path.kind === 'folder' ? 'ri-folder-3-line text-warning-500' : 'ri-key-2-line text-foreground-400'} text-sm`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate font-mono text-[11px]" title={logicalPath}>{logicalPath}</span>
                  {path.visitedAt !== undefined && (
                    <time
                      dateTime={new Date(path.visitedAt).toISOString()}
                      title={formatDateTime(new Date(path.visitedAt).toISOString())}
                      className="shrink-0 text-[10px] tabular-nums text-foreground-400"
                    >
                      {formatRelativeTime(path.visitedAt)}
                    </time>
                  )}
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </HomeCard>
  );
}

export function AccessCenterCard() {
  return (
    <HomeCard title="Access Center" icon="ri-shield-user-line">
      <p className="text-xs leading-5 text-foreground-600">
        Manage userpass users, groups, roles and policies. Every change is reviewed before it is applied.
      </p>
      <Link
        to="/access-control/users"
        className={`mt-3 inline-flex h-11 items-center gap-1.5 rounded-md border border-background-300 bg-background-100 px-3 text-xs font-medium text-foreground-800 hover:bg-background-200 sm:h-8 ${HOME_FOCUS_RING}`}
      >
        Open Access Center
        <i className="ri-arrow-right-line" aria-hidden="true" />
      </Link>
    </HomeCard>
  );
}
