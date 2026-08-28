import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/application/notifications/ToastContext';
import type {
  BulkDestroyPreflight,
  BulkDestroyTarget,
} from '@/application/vault/bulk/bulk-destroy';
import { useKvV2Gateway } from '@/application/vault/KvV2GatewayContext';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { summarizeBulkOutcomes } from '@/domain/vault/bulk-operation';
import { normalizeVaultError } from '@/domain/vault/errors';

export interface BulkDestroyUiState {
  readonly mount: string;
  readonly directoryPath: string;
  readonly paths: readonly string[];
  readonly status: 'preparing' | 'ready' | 'submitting' | 'error';
  readonly preflight?: BulkDestroyPreflight;
  readonly error?: string;
}

interface BulkDestroyControllerOptions {
  readonly activeMount: string;
  readonly activePath: string;
  readonly refreshPaths: (
    mount: string,
    directoryPath: string,
    paths: readonly string[],
  ) => Promise<void>;
  readonly clearSelection: () => void;
}

export function useBulkDestroyController({
  activeMount,
  activePath,
  refreshPaths,
  clearSelection,
}: BulkDestroyControllerOptions) {
  const vault = useVaultSession();
  const session = vault.session!;
  const gateway = useKvV2Gateway();
  const toast = useToast();
  const [state, setState] = useState<BulkDestroyUiState | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef<AbortController | null>(null);

  const close = () => {
    requestIdRef.current += 1;
    abortRef.current?.abort();
    abortRef.current = null;
    setState(null);
  };
  useEffect(() => () => abortRef.current?.abort(), []);

  const begin = async (
    paths: readonly string[],
    mount = activeMount,
    directoryPath = activePath,
  ) => {
    const requestId = ++requestIdRef.current;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setState({ mount, directoryPath, paths, status: 'preparing' });
    try {
      const { prepareBulkDestroy } = await import(
        '@/application/vault/bulk/bulk-destroy'
      );
      const preflight = await prepareBulkDestroy({
        gateway,
        session,
        mount,
        paths,
        queryCapabilities: vault.queryCapabilities,
        signal: controller.signal,
      });
      if (requestId !== requestIdRef.current) return;
      setState({ mount, directoryPath, paths, status: 'ready', preflight });
    } catch (cause) {
      if (requestId !== requestIdRef.current) return;
      const error = normalizeVaultError(cause);
      if (error.code === 'aborted') return;
      if (error.code === 'session-expired') vault.expireSession();
      setState({ mount, directoryPath, paths, status: 'error', error: error.message });
    } finally {
      if (requestId === requestIdRef.current) abortRef.current = null;
    }
  };
  const confirm = async (targets: readonly BulkDestroyTarget[]) => {
    if (!state?.preflight || state.status !== 'ready') return;
    const operation = state;
    setState({ ...operation, status: 'submitting' });
    const { executeBulkDestroy } = await import(
      '@/application/vault/bulk/bulk-destroy'
    );
    const outcomes = await executeBulkDestroy({
      gateway,
      session,
      mount: operation.mount,
      targets,
    });
    const summary = summarizeBulkOutcomes(outcomes);
    const successfulPaths = outcomes
      .filter((outcome) => outcome.status === 'succeeded')
      .map((outcome) => outcome.path);
    const destroyedVersionCount = outcomes
      .filter((outcome) => outcome.status === 'succeeded')
      .reduce((count, outcome) => count + outcome.versions.length, 0);
    await refreshPaths(operation.mount, operation.directoryPath, successfulPaths);
    close();
    clearSelection();
    if (destroyedVersionCount > 0) {
      toast.success(
        `Permanently destroyed ${destroyedVersionCount} versions across ${successfulPaths.length} secrets.`,
      );
    }
    if (summary.denied + summary.missing + summary.failed > 0) {
      toast.error(
        `${summary.denied} denied, ${summary.missing} missing, ${summary.failed} failed.`,
        { title: 'Bulk destroy was only partially completed' },
      );
    }
    if (outcomes.some((outcome) => outcome.errorCode === 'session-expired')) {
      vault.expireSession();
    }
  };

  return { state, close, begin, confirm };
}
