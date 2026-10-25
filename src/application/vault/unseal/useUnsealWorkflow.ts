import { useCallback, useEffect, useRef, useState } from 'react';

import type { VaultSealGateway } from '@/domain/vault/contracts';
import { normalizeVaultError, type VaultError } from '@/domain/vault/errors';
import {
  classifyUnsealSubmission,
  isPlausibleUnsealKeyShare,
  normalizeUnsealKeyShare,
  unsealPhase,
  type UnsealSubmissionOutcome,
  type VaultSealStatus,
} from '@/domain/vault/seal';
import { vaultUnsealKey } from '@/domain/vault/sensitive-value';

export const UNSEAL_STATUS_POLL_MS = 5_000;

export type UnsealFeedback =
  | UnsealSubmissionOutcome
  | 'invalid-format'
  | 'rejected-share'
  | 'reset-by-operator';

export type UnsealOperation = 'idle' | 'loading' | 'submitting' | 'resetting';

export interface UnsealWorkflowState {
  readonly status?: VaultSealStatus;
  readonly operation: UnsealOperation;
  readonly feedback?: UnsealFeedback;
  readonly error?: VaultError;
  refresh(): Promise<void>;
  submitKeyShare(rawShare: string): Promise<UnsealFeedback | undefined>;
  resetProgress(): Promise<void>;
}

interface UnsealWorkflowOptions {
  readonly serverUrl?: string;
  readonly gateway: VaultSealGateway;
  readonly pollIntervalMs?: number;
}

function isDocumentVisible(): boolean {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden';
}

/**
 * Drives one browser-side unseal attempt. Key shares are wrapped in a
 * memory-only sensitive value for the single request and never enter React
 * state, storage, or diagnostics.
 */
export function useUnsealWorkflow({
  serverUrl,
  gateway,
  pollIntervalMs = UNSEAL_STATUS_POLL_MS,
}: UnsealWorkflowOptions): UnsealWorkflowState {
  const [status, setStatus] = useState<VaultSealStatus>();
  const [operation, setOperation] = useState<UnsealOperation>('idle');
  const [feedback, setFeedback] = useState<UnsealFeedback>();
  const [error, setError] = useState<VaultError>();
  const statusRef = useRef<VaultSealStatus | undefined>(undefined);
  const controllerRef = useRef<AbortController | null>(null);
  const busyRef = useRef(false);

  const applyStatus = useCallback((next: VaultSealStatus) => {
    statusRef.current = next;
    setStatus(next);
  }, []);

  const beginRequest = useCallback(() => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller;
  }, []);

  const fetchStatus = useCallback(async (signal: AbortSignal) => {
    if (!serverUrl) return undefined;
    const next = await gateway.getSealStatus(serverUrl, signal);
    applyStatus(next);
    return next;
  }, [applyStatus, gateway, serverUrl]);

  const refresh = useCallback(async () => {
    if (!serverUrl || busyRef.current) return;
    const controller = beginRequest();
    if (!statusRef.current) setOperation('loading');
    try {
      await fetchStatus(controller.signal);
      setError(undefined);
    } catch (cause) {
      const nextError = normalizeVaultError(cause);
      if (nextError.code !== 'aborted') setError(nextError);
    } finally {
      if (controllerRef.current === controller) setOperation('idle');
    }
  }, [beginRequest, fetchStatus, serverUrl]);

  const runExclusive = useCallback(async <T,>(
    nextOperation: Exclude<UnsealOperation, 'idle' | 'loading'>,
    action: (signal: AbortSignal) => Promise<T>,
  ): Promise<T | undefined> => {
    if (busyRef.current) return undefined;
    busyRef.current = true;
    const controller = beginRequest();
    setOperation(nextOperation);
    setError(undefined);
    try {
      return await action(controller.signal);
    } finally {
      busyRef.current = false;
      if (controllerRef.current === controller) setOperation('idle');
    }
  }, [beginRequest]);

  const submitKeyShare = useCallback(async (rawShare: string) => {
    if (!serverUrl) return undefined;
    const share = normalizeUnsealKeyShare(rawShare);
    if (!isPlausibleUnsealKeyShare(share)) {
      setFeedback('invalid-format');
      return 'invalid-format' as const;
    }
    return runExclusive('submitting', async (signal) => {
      const before = statusRef.current;
      try {
        const after = await gateway.submitUnsealKey(serverUrl, vaultUnsealKey(share), signal);
        applyStatus(after);
        const outcome = classifyUnsealSubmission(before, after);
        setFeedback(outcome);
        return outcome;
      } catch (cause) {
        const nextError = normalizeVaultError(cause);
        if (nextError.code === 'aborted') return undefined;
        if (nextError.code !== 'invalid-request') {
          setError(nextError);
          return undefined;
        }
        const after = await fetchStatus(signal).catch(() => undefined);
        const nextFeedback: UnsealFeedback = before && before.progress > 0 && after?.progress === 0
          ? 'reset-by-vault'
          : 'rejected-share';
        setFeedback(nextFeedback);
        return nextFeedback;
      }
    });
  }, [applyStatus, fetchStatus, gateway, runExclusive, serverUrl]);

  const resetProgress = useCallback(async () => {
    if (!serverUrl) return;
    await runExclusive('resetting', async (signal) => {
      try {
        applyStatus(await gateway.resetUnseal(serverUrl, signal));
        setFeedback('reset-by-operator');
      } catch (cause) {
        const nextError = normalizeVaultError(cause);
        if (nextError.code !== 'aborted') setError(nextError);
      }
    });
  }, [applyStatus, gateway, runExclusive, serverUrl]);

  useEffect(() => {
    statusRef.current = undefined;
    setStatus(undefined);
    setFeedback(undefined);
    setError(undefined);
    void refresh();
    return () => controllerRef.current?.abort();
  }, [refresh]);

  const awaitingShares = status !== undefined && unsealPhase(status) !== 'unsealed';
  useEffect(() => {
    if (!awaitingShares || pollIntervalMs <= 0) return undefined;
    const timer = window.setInterval(() => {
      if (isDocumentVisible()) void refresh();
    }, pollIntervalMs);
    return () => window.clearInterval(timer);
  }, [awaitingShares, pollIntervalMs, refresh]);

  return { status, operation, feedback, error, refresh, submitKeyShare, resetProgress };
}
