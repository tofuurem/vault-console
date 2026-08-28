import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import { directoryPathForSecret } from '@/router/explorer-route';
import { mapWithConcurrency } from '@/shared/async/map-with-concurrency';

export interface ExplorerRefreshController {
  readonly refreshPath: (mount: string, path: string) => Promise<void>;
  readonly refreshPaths: (
    mount: string,
    directoryPath: string,
    paths: readonly string[],
  ) => Promise<void>;
}

export function useExplorerRefreshController(): ExplorerRefreshController {
  const queryClient = useQueryClient();

  const refreshPath = useCallback(async (mount: string, path: string) => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: vaultQueryKeys.directory(mount, directoryPathForSecret(path)),
      }),
      queryClient.invalidateQueries({
        queryKey: vaultQueryKeys.secretScope(mount, path),
      }),
      queryClient.invalidateQueries({
        queryKey: vaultQueryKeys.permissions(mount, path),
      }),
    ]);
  }, [queryClient]);

  const refreshPaths = useCallback(async (
    mount: string,
    directoryPath: string,
    paths: readonly string[],
  ) => {
    await queryClient.invalidateQueries({
      queryKey: vaultQueryKeys.directory(mount, directoryPath),
    });
    await mapWithConcurrency(paths, 4, async (path) => {
      await Promise.all([
        queryClient.invalidateQueries({
          queryKey: vaultQueryKeys.secretScope(mount, path),
        }),
        queryClient.invalidateQueries({
          queryKey: vaultQueryKeys.permissions(mount, path),
        }),
      ]);
    });
  }, [queryClient]);

  return { refreshPath, refreshPaths };
}
