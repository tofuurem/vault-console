import { useEffect, useRef, useState } from 'react';

import { useNavigationHistory } from '@/application/navigation-history/NavigationHistoryContext';
import { useToast } from '@/application/notifications/ToastContext';
import type { BulkDeleteKeysPreflight } from '@/application/vault/bulk/bulk-delete-keys';
import { useKvV2Gateway } from '@/application/vault/KvV2GatewayContext';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import {
  summarizeBulkOutcomes,
  type BulkItemOutcome,
} from '@/domain/vault/bulk-operation';
import { normalizeVaultError } from '@/domain/vault/errors';

export interface BulkDeleteKeysUiState {
  readonly mount: string;
  readonly directoryPath: string;
  readonly paths: readonly string[];
  readonly status: 'preparing' | 'ready' | 'submitting' | 'completed' | 'error';
  readonly preflight?: BulkDeleteKeysPreflight;
  readonly outcomes?: readonly BulkItemOutcome[];
  readonly error?: string;
}

interface BulkDeleteKeysControllerOptions {
  readonly activeMount: string;
  readonly activePath: string;
  readonly refreshPaths: (
    mount: string,
    directoryPath: string,
    paths: readonly string[],
  ) => Promise<void>;
  readonly clearSelection: () => void;
}

export function useBulkDeleteKeysController({
  activeMount,
  activePath,
  refreshPaths,
  clearSelection,
}: BulkDeleteKeysControllerOptions) {
  const vault = useVaultSession();
  const session = vault.session!;
  const gateway = useKvV2Gateway();
  const toast = useToast();
  const { removeSecretPaths } = useNavigationHistory();
  const [state, setState] = useState<BulkDeleteKeysUiState | null>(null);
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
      const { prepareBulkDeleteKeys } = await import(
        '@/application/vault/bulk/bulk-delete-keys'
      );
      const preflight = await prepareBulkDeleteKeys({
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
  const confirm = async () => {
    if (!state?.preflight || state.status !== 'ready') return;
    const operation = state;
    const preflight = state.preflight;
    setState({ ...operation, status: 'submitting' });
    const { executeBulkDeleteKeys } = await import(
      '@/application/vault/bulk/bulk-delete-keys'
    );
    const outcomes = await executeBulkDeleteKeys({
      gateway,
      session,
      mount: operation.mount,
      candidates: preflight.eligible,
    });
    const summary = summarizeBulkOutcomes(outcomes);
    const clearedPaths = outcomes
      .filter((outcome) => outcome.status === 'succeeded' || outcome.status === 'missing')
      .map((outcome) => outcome.path);
    if (clearedPaths.length > 0) {
      await refreshPaths(operation.mount, operation.directoryPath, clearedPaths);
      removeSecretPaths(operation.mount, clearedPaths);
    }
    clearSelection();
    if (outcomes.some((outcome) => outcome.errorCode === 'session-expired')) {
      vault.expireSession();
    }
    if (summary.denied + summary.missing + summary.failed > 0) {
      setState({ ...operation, status: 'completed', outcomes });
      toast.warning(
        `${summary.succeeded} deleted, ${summary.denied} denied, ${summary.missing} missing, ${summary.failed} failed.`,
        { title: 'Permanent deletion was only partially completed', durationMs: null },
      );
      return;
    }
    close();
    toast.success(`Permanently deleted ${summary.succeeded} keys.`);
  };

  return { state, close, begin, confirm };
}
