export type VaultErrorCode =
  | 'aborted'
  | 'authentication'
  | 'authorization'
  | 'conflict'
  | 'invalid-request'
  | 'invalid-response'
  | 'not-found'
  | 'rate-limited'
  | 'sealed'
  | 'uninitialized'
  | 'session-expired'
  | 'unavailable'
  | 'unknown';

export interface VaultErrorDiagnostic {
  readonly operation: string;
  readonly durationMs?: number;
  readonly retryCount?: number;
  readonly requestId?: string;
}

const SAFE_MESSAGES: Record<VaultErrorCode, string> = {
  aborted: 'The Vault request was cancelled.',
  authentication: 'Vault rejected the supplied credentials.',
  authorization: 'Your Vault token does not allow this operation.',
  conflict: 'Vault changed while this operation was being prepared.',
  'invalid-request': 'Vault rejected the requested operation.',
  'invalid-response': 'Vault returned a response the console could not understand.',
  'not-found': 'The requested Vault resource was not found.',
  'rate-limited': 'Vault is receiving too many requests. Try again shortly.',
  sealed: 'Vault is sealed. Unseal it before continuing.',
  uninitialized: 'Vault has not been initialized yet.',
  'session-expired': 'Your Vault session has expired. Sign in again.',
  unavailable: 'Vault is currently unavailable.',
  unknown: 'The Vault operation could not be completed.',
};

export class VaultError extends Error {
  readonly code: VaultErrorCode;
  readonly retryable: boolean;
  readonly status?: number;
  readonly diagnostic?: VaultErrorDiagnostic;

  constructor(code: VaultErrorCode, options: {
    cause?: unknown;
    status?: number;
    diagnostic?: VaultErrorDiagnostic;
  } = {}) {
    super(SAFE_MESSAGES[code], { cause: options.cause });
    this.name = 'VaultError';
    this.code = code;
    const previous = options.cause instanceof VaultError ? options.cause : undefined;
    this.status = options.status ?? previous?.status;
    this.diagnostic = options.diagnostic ?? previous?.diagnostic;
    this.retryable = code === 'rate-limited' || code === 'unavailable';
  }
}

export function vaultErrorFromStatus(
  status: number,
  diagnostic?: VaultErrorDiagnostic,
): VaultError {
  const options = { status, diagnostic };
  if (status === 400 || status === 422) return new VaultError('invalid-request', options);
  if (status === 401) return new VaultError('session-expired', options);
  if (status === 403) return new VaultError('authorization', options);
  if (status === 404) return new VaultError('not-found', options);
  if (status === 409 || status === 412) return new VaultError('conflict', options);
  if (status === 429) return new VaultError('rate-limited', options);
  if (status >= 500) return new VaultError('unavailable', options);
  return new VaultError('unknown', options);
}

export function normalizeVaultError(error: unknown): VaultError {
  if (error instanceof VaultError) return error;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return new VaultError('aborted', { cause: error });
  }
  if (error instanceof TypeError) {
    return new VaultError('unavailable', { cause: error });
  }
  return new VaultError('unknown', { cause: error });
}
