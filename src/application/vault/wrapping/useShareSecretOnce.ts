import { useCallback, useEffect, useRef, useState } from 'react';

import type { VaultSession } from '@/domain/vault/contracts';
import { normalizeVaultError, type VaultError } from '@/domain/vault/errors';
import {
  wrappingExpiresAt,
  type WrapTtl,
  type WrappedSecretShare,
} from '@/domain/vault/wrapping';
import { useWrappingGateway } from '../WrappingGatewayContext';

export type ShareSecretOnceState =
  | { readonly status: 'idle' | 'wrapping' }
  | {
      readonly status: 'shared';
      readonly share: WrappedSecretShare;
      readonly expiresAt?: number;
    }
  | { readonly status: 'error'; readonly error: VaultError };

export interface ShareSecretOnceRequest {
  readonly session: VaultSession;
  readonly mount: string;
  readonly path: string;
  readonly version: number;
  readonly ttl: WrapTtl;
}

export interface ShareSecretOnce {
  readonly state: ShareSecretOnceState;
  share(request: ShareSecretOnceRequest): Promise<void>;
  /** Drops the wrapping token from memory. */
  reset(): void;
}

/**
 * Creates a single-use wrapping token for one secret version. The token is
 * held only as a memory-only sensitive value until `reset`; it never enters
 * the query cache, storage, URLs, or diagnostics.
 */
export function useShareSecretOnce(): ShareSecretOnce {
  const gateway = useWrappingGateway();
  const [state, setState] = useState<ShareSecretOnceState>({ status: 'idle' });
  const controllerRef = useRef<AbortController | null>(null);

  useEffect(() => () => controllerRef.current?.abort(), []);

  const reset = useCallback(() => {
    controllerRef.current?.abort();
    controllerRef.current = null;
    setState({ status: 'idle' });
  }, []);

  const share = useCallback(async (request: ShareSecretOnceRequest) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;
    setState({ status: 'wrapping' });
    try {
      const result = await gateway.wrapKvSecretVersion(
        request.session,
        request.mount,
        request.path,
        request.version,
        request.ttl,
        controller.signal,
      );
      if (controller.signal.aborted) return;
      setState({ status: 'shared', share: result, expiresAt: wrappingExpiresAt(result) });
    } catch (cause) {
      if (controller.signal.aborted) return;
      setState({ status: 'error', error: normalizeVaultError(cause) });
    }
  }, [gateway]);

  return { state, share, reset };
}
