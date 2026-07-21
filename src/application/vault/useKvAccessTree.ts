import { useEffect, useReducer, useState } from 'react';

import type { KvAccessTreeNode } from '@/domain/access-control/effective-access';
import type { KvV2Gateway, KvV2Mount, VaultSession } from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';
import { useKvV2Gateway } from './KvV2GatewayContext';
import type { VaultQueryState } from './useKvExplorerData';

interface TreeLimits {
  readonly maxDepth?: number;
  readonly maxNodes?: number;
}

export async function discoverKvAccessTree(
  gateway: KvV2Gateway,
  session: VaultSession,
  mounts: readonly KvV2Mount[],
  signal?: AbortSignal,
  limits: TreeLimits = {},
): Promise<readonly KvAccessTreeNode[]> {
  const maxDepth = limits.maxDepth ?? 6;
  const maxNodes = limits.maxNodes ?? 500;
  let nodeCount = mounts.length;

  const children = async (mount: string, path: string, depth: number): Promise<readonly KvAccessTreeNode[]> => {
    if (depth >= maxDepth || nodeCount >= maxNodes) return [];
    let keys: readonly string[];
    try {
      keys = await gateway.listPaths(session, mount, path, signal);
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired' || error.code === 'aborted') throw error;
      return [];
    }
    const nodes: KvAccessTreeNode[] = [];
    for (const key of keys) {
      if (nodeCount >= maxNodes) break;
      const folder = key.endsWith('/');
      const label = key.replace(/\/$/, '');
      const logicalPath = `${path}${key}`.replace(/\/$/, '');
      nodeCount += 1;
      nodes.push({
        id: `${mount}:${logicalPath}`,
        label,
        mount,
        path: logicalPath,
        target: folder ? 'folder' : 'secret',
        children: folder ? await children(mount, `${logicalPath}/`, depth + 1) : [],
      });
    }
    return nodes;
  };

  const tree: KvAccessTreeNode[] = [];
  for (const mount of mounts) {
    tree.push({
      id: `${mount.path}:`,
      label: mount.path,
      mount: mount.path,
      path: '',
      target: 'folder',
      children: await children(mount.path, '', 0),
    });
  }
  return tree;
}

export function useKvAccessTree(
  session: VaultSession,
  mounts: readonly KvV2Mount[],
): readonly [VaultQueryState<readonly KvAccessTreeNode[]>, () => void] {
  const gateway = useKvV2Gateway();
  const [refreshSignal, refresh] = useReducer((value: number) => value + 1, 0);
  const [state, setState] = useState<VaultQueryState<readonly KvAccessTreeNode[]>>({ status: 'idle' });
  useEffect(() => {
    if (!mounts.length) {
      setState({ status: 'success', data: [] });
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ status: 'loading', data: current.data }));
    discoverKvAccessTree(gateway, session, mounts, controller.signal).then(
      (tree) => setState({ status: 'success', data: tree }),
      (cause) => {
        const error = normalizeVaultError(cause);
        if (error.code !== 'aborted') setState((current) => ({ status: 'error', error, data: current.data }));
      },
    );
    return () => controller.abort();
  }, [gateway, mounts, refreshSignal, session]);
  return [state, refresh];
}
