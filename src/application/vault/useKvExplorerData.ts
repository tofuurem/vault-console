import { useEffect, useReducer, useState } from 'react';

import type {
  KvV2Mount,
  KvV2Secret,
  KvV2SecretHistory,
  VaultSession,
} from '@/domain/vault/contracts';
import { normalizeVaultError, type VaultError } from '@/domain/vault/errors';
import { useKvV2Gateway } from './KvV2GatewayContext';

export type VaultQueryState<T> =
  | { readonly status: 'idle' | 'loading'; readonly data?: T }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: VaultError; readonly data?: T };

export interface KvSecretDetails {
  readonly secret?: KvV2Secret;
  readonly history: KvV2SecretHistory;
}

function useRefreshSignal(): readonly [number, () => void] {
  const [signal, refresh] = useReducer((value: number) => value + 1, 0);
  return [signal, refresh] as const;
}

export function useKvMounts(session: VaultSession): readonly [VaultQueryState<readonly KvV2Mount[]>, () => void] {
  const gateway = useKvV2Gateway();
  const [refreshSignal, refresh] = useRefreshSignal();
  const [state, setState] = useState<VaultQueryState<readonly KvV2Mount[]>>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ status: 'loading', data: current.data }));
    gateway.listMounts(session, controller.signal).then(
      (mounts) => setState({ status: 'success', data: mounts }),
      (cause) => {
        const error = normalizeVaultError(cause);
        if (error.code !== 'aborted') setState((current) => ({ status: 'error', error, data: current.data }));
      },
    );
    return () => controller.abort();
  }, [gateway, refreshSignal, session]);

  return [state, refresh];
}

export function useKvDirectory(
  session: VaultSession,
  mount: string,
  path: string,
): readonly [VaultQueryState<readonly string[]>, () => void] {
  const gateway = useKvV2Gateway();
  const [refreshSignal, refresh] = useRefreshSignal();
  const [state, setState] = useState<VaultQueryState<readonly string[]>>({ status: 'idle' });

  useEffect(() => {
    if (!mount) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState((current) => ({ status: 'loading', data: current.data }));
    gateway.listPaths(session, mount, path, controller.signal).then(
      (keys) => setState({ status: 'success', data: keys }),
      (cause) => {
        const error = normalizeVaultError(cause);
        if (error.code !== 'aborted') setState((current) => ({ status: 'error', error, data: current.data }));
      },
    );
    return () => controller.abort();
  }, [gateway, mount, path, refreshSignal, session]);

  return [state, refresh];
}

export function useKvSecretDetails(
  session: VaultSession,
  mount: string,
  path: string | null,
): readonly [VaultQueryState<KvSecretDetails>, () => void] {
  const gateway = useKvV2Gateway();
  const [refreshSignal, refresh] = useRefreshSignal();
  const [state, setState] = useState<VaultQueryState<KvSecretDetails>>({ status: 'idle' });

  useEffect(() => {
    if (!mount || !path) {
      setState({ status: 'idle' });
      return;
    }
    const controller = new AbortController();
    setState({ status: 'loading' });
    gateway.readSecretHistory(session, mount, path, controller.signal).then(async (history) => {
      const current = history.versions.find((version) => version.version === history.currentVersion);
      if (current?.destroyed || current?.deletionTime) return { history };
      const secret = await gateway.readSecret(session, mount, path, undefined, controller.signal);
      return { secret, history };
    }).then(
      (details) => setState({ status: 'success', data: details }),
      (cause) => {
        const error = normalizeVaultError(cause);
        if (error.code !== 'aborted') setState({ status: 'error', error });
      },
    );
    return () => controller.abort();
  }, [gateway, mount, path, refreshSignal, session]);

  return [state, refresh];
}
