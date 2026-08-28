import type { ComponentProps } from 'react';

import type { AuthenticatedShellContextValue } from '@/app/authenticated-shell';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import type { KvV2Mount } from '@/domain/vault/contracts';
import ExplorerMain from './ExplorerMain';

interface ExplorerContentProps {
  readonly mountsState: AuthenticatedShellContextValue['mountsState'];
  readonly mounts: readonly KvV2Mount[];
  readonly refreshMounts: () => void;
  readonly main: ComponentProps<typeof ExplorerMain>;
}

export default function ExplorerContent({
  mountsState,
  mounts,
  refreshMounts,
  main,
}: ExplorerContentProps) {
  if (mountsState.status === 'loading' && !mountsState.data) {
    return (
      <main id="main-content" tabIndex={-1} className="flex min-w-0 flex-1">
        <ContentSkeleton label="Discovering visible KV v2 mounts" />
      </main>
    );
  }
  if (mountsState.status === 'error' && !mountsState.data) {
    return (
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center p-6">
        <div role="alert" className="max-w-md rounded-lg border border-warning-200 bg-warning-50 p-4 text-sm text-warning-800">
          <p className="font-semibold">KV mounts could not be discovered</p>
          <p className="mt-1 text-xs leading-5">{mountsState.error.message}</p>
          <button type="button" onClick={refreshMounts} className="mt-3 text-xs font-medium underline underline-offset-2">Retry</button>
        </div>
      </main>
    );
  }
  if (mounts.length === 0) {
    return (
      <main id="main-content" tabIndex={-1} className="flex flex-1 items-center justify-center p-6">
        <div className="max-w-md text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-background-200">
            <i className="ri-folder-shield-2-line text-xl text-foreground-400" aria-hidden="true" />
          </div>
          <h1 className="text-sm font-semibold text-foreground-800">No visible KV v2 mounts</h1>
          <p className="mt-1 text-xs leading-5 text-foreground-500">Vault only returns mounts available to this token. Ask an administrator for metadata access if a mount is missing.</p>
        </div>
      </main>
    );
  }
  return <ExplorerMain {...main} />;
}
