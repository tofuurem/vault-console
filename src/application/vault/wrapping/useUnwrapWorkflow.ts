import { useCallback, useEffect, useRef, useState } from 'react';

import { normalizeVaultError, type VaultError } from '@/domain/vault/errors';
import { vaultWrappingToken, type VaultWrappingToken } from '@/domain/vault/sensitive-value';
import {
  isPlausibleWrappingToken,
  normalizeWrappingToken,
  wrappingExpiresAt,
  type UnwrappedSecret,
  type VaultWrappingGateway,
  type WrappingTokenInfo,
} from '@/domain/vault/wrapping';

export type UnwrapProblem = 'invalid-format' | 'unknown-token' | 'vault';

export interface CheckedWrappingToken {
  readonly info: WrappingTokenInfo;
  readonly expiresAt?: number;
}

export type UnwrapWorkflowState =
  | { readonly step: 'enter'; readonly problem?: UnwrapProblem; readonly error?: VaultError }
  | { readonly step: 'checking' }
  | {
      readonly step: 'ready' | 'unwrapping';
      readonly checked: CheckedWrappingToken;
      readonly problem?: UnwrapProblem;
      readonly error?: VaultError;
    }
  | {
      readonly step: 'unwrapped';
      readonly checked: CheckedWrappingToken;
      readonly secret: UnwrappedSecret;
    };

export interface UnwrapWorkflow {
  readonly state: UnwrapWorkflowState;
  /** Looks the token up without consuming it. */
  check(rawToken: string): Promise<void>;
  /** Consumes the checked token. */
  unwrap(): Promise<void>;
  startOver(): void;
}

/** Vault answers an unknown, expired, or used token with 400 or 403. */
function problemFor(error: VaultError): UnwrapProblem {
  return ['invalid-request', 'not-found', 'authorization', 'session-expired'].includes(error.code)
    ? 'unknown-token'
    : 'vault';
}

/** A transient failure may leave the token unused, so it can be retried. */
function mayRetry(error: VaultError): boolean {
  return error.code === 'unavailable' || error.code === 'rate-limited' || error.code === 'sealed';
}

/**
 * Drives the public unwrap page without a Vault session. The pasted token is
 * kept only in a memory-only sensitive value inside a ref, never in React
 * state, storage, URLs, history state, or diagnostics, and is dropped as soon
 * as it has been used.
 */
export function useUnwrapWorkflow({ serverUrl, gateway }: {
  readonly serverUrl: string;
  readonly gateway: VaultWrappingGateway;
}): UnwrapWorkflow {
  const [state, setState] = useState<UnwrapWorkflowState>({ step: 'enter' });
  const tokenRef = useRef<VaultWrappingToken | null>(null);
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => {
    controllerRef.current?.abort();
    tokenRef.current = null;
  }, []);

  const begin = () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    return controller;
  };

  const check = useCallback(async (rawToken: string) => {
    tokenRef.current = null;
    if (!isPlausibleWrappingToken(rawToken)) {
      setState({ step: 'enter', problem: 'invalid-format' });
      return;
    }
    const token = vaultWrappingToken(normalizeWrappingToken(rawToken));
    const controller = begin();
    setState({ step: 'checking' });
    try {
      const info = await gateway.lookupWrappingToken(serverUrl, token, controller.signal);
      if (controller.signal.aborted) return;
      tokenRef.current = token;
      setState({ step: 'ready', checked: { info, expiresAt: wrappingExpiresAt(info) } });
    } catch (cause) {
      if (controller.signal.aborted) return;
      const error = normalizeVaultError(cause);
      setState({ step: 'enter', problem: problemFor(error), error });
    }
  }, [gateway, serverUrl]);

  const unwrap = useCallback(async () => {
    const token = tokenRef.current;
    if (state.step !== 'ready' || !token) return;
    const { checked } = state;
    const controller = begin();
    setState({ step: 'unwrapping', checked });
    try {
      const secret = await gateway.unwrapSecret(serverUrl, token, controller.signal);
      tokenRef.current = null;
      if (controller.signal.aborted) return;
      setState({ step: 'unwrapped', checked, secret });
    } catch (cause) {
      if (controller.signal.aborted) return;
      const error = normalizeVaultError(cause);
      if (mayRetry(error)) {
        setState({ step: 'ready', checked, problem: 'vault', error });
        return;
      }
      tokenRef.current = null;
      setState({ step: 'enter', problem: problemFor(error), error });
    }
  }, [gateway, serverUrl, state]);

  const startOver = useCallback(() => {
    controllerRef.current?.abort();
    tokenRef.current = null;
    setState({ step: 'enter' });
  }, []);

  return { state, check, unwrap, startOver };
}
