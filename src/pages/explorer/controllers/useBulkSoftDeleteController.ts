import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/application/notifications/ToastContext';
import type { BulkSoftDeletePreflight } from '@/application/vault/bulk/bulk-soft-delete';
import { useKvV2Gateway } from '@/application/vault/KvV2GatewayContext';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import { summarizeBulkOutcomes } from '@/domain/vault/bulk-operation';
import { normalizeVaultError } from '@/domain/vault/errors';

export interface BulkSoftDeleteUiState {
  readonly mount: string;
  readonly directoryPath: string;
  readonly paths: readonly string[];
  readonly status: 'preparing' | 'ready' | 'submitting' | 'error';
  readonly preflight?: BulkSoftDeletePreflight;
  readonly error?: string;
}

interface BulkSoftDeleteControllerOptions {
  readonly activeMount: string;
  readonly activePath: string;
  readonly refreshPaths: (
    mount: string,
    directoryPath: string,
    paths: readonly string[],
  ) => Promise<void>;
  readonly clearSelection: () => void;
}

export function useBulkSoftDeleteController({
  activeMount,
  activePath,
  refreshPaths,
  clearSelection,
}: BulkSoftDeleteControllerOptions) {
  const vault = useVaultSession();
  const session = vault.session!;
  const gateway = useKvV2Gateway();
  const toast = useToast();
  const [state, setState] = useState<BulkSoftDeleteUiState | null>(null);
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
      const { prepareBulkSoftDelete } = await import(
        '@/application/vault/bulk/bulk-soft-delete'
      );
      const preflight = await prepareBulkSoftDelete({
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
  const undo = async (
    mount: string,
    directoryPath: string,
    candidates: BulkSoftDeletePreflight['eligible'],
  ) => {
    const { undoBulkSoftDelete } = await import(
      '@/application/vault/bulk/bulk-soft-delete'
    );
    const outcomes = await undoBulkSoftDelete({ gateway, session, mount, candidates });
    const summary = summarizeBulkOutcomes(outcomes);
    const restoredPaths = outcomes
      .filter((outcome) => outcome.status === 'succeeded')
      .map((outcome) => outcome.path);
    if (restoredPaths.length > 0) {
      await refreshPaths(mount, directoryPath, restoredPaths);
      toast.success(`Restored ${restoredPaths.length} soft-deleted current versions.`);
    }
    if (outcomes.some((outcome) => outcome.errorCode === 'session-expired')) {
      vault.expireSession();
    }
    if (summary.denied + summary.missing + summary.failed > 0) {
      toast.error(
        `${summary.denied} denied, ${summary.missing} missing, ${summary.failed} failed.`,
        { title: 'Bulk Undo was only partially completed' },
      );
    }
  };
  const confirm = async () => {
    if (!state?.preflight || state.status !== 'ready') return;
    const operation = state;
    const preflight = state.preflight;
    setState({ ...operation, status: 'submitting' });
    const { executeBulkSoftDelete } = await import(
      '@/application/vault/bulk/bulk-soft-delete'
    );
    const outcomes = await executeBulkSoftDelete({
      gateway,
      session,
      mount: operation.mount,
      candidates: preflight.eligible,
    });
    const summary = summarizeBulkOutcomes(outcomes);
    const succeeded = preflight.eligible.filter((candidate) => (
      outcomes.some((outcome) => outcome.path === candidate.path && outcome.status === 'succeeded')
    ));
    await refreshPaths(
      operation.mount,
      operation.directoryPath,
      succeeded.map((candidate) => candidate.path),
    );
    close();
    clearSelection();

    const undoable = succeeded.filter((candidate) => candidate.canUndo);
    const withoutUndo = succeeded.length - undoable.length;
    if (undoable.length > 0) {
      toast.action(
        `${succeeded.length} current versions were soft-deleted.${
          withoutUndo > 0 ? ` ${withoutUndo} cannot be undone by this token.` : ''
        }`,
        {
          label: `Undo ${undoable.length}`,
          onAction: () => void undo(operation.mount, operation.directoryPath, undoable),
        },
      );
    } else if (succeeded.length > 0) {
      toast.success(
        `${succeeded.length} current versions were soft-deleted. Undo is not allowed by this token.`,
      );
    }
    if (summary.denied + summary.missing + summary.failed > 0) {
      toast.warning(
        `${summary.denied} denied, ${summary.missing} missing, ${summary.failed} failed.`,
        { title: 'Bulk soft-delete was only partially completed', durationMs: null },
      );
    }
    if (outcomes.some((outcome) => outcome.errorCode === 'session-expired')) {
      vault.expireSession();
    }
  };

  return { state, close, begin, confirm };
}
