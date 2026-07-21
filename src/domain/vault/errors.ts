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
  | 'session-expired'
  | 'unavailable'
  | 'unknown';

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
  'session-expired': 'Your Vault session has expired. Sign in again.',
  unavailable: 'Vault is currently unavailable.',
  unknown: 'The Vault operation could not be completed.',
};

export class VaultError extends Error {
  readonly code: VaultErrorCode;
  readonly retryable: boolean;
  readonly status?: number;

  constructor(code: VaultErrorCode, options: { cause?: unknown; status?: number } = {}) {
    super(SAFE_MESSAGES[code], { cause: options.cause });
    this.name = 'VaultError';
    this.code = code;
    this.status = options.status;
    this.retryable = code === 'rate-limited' || code === 'unavailable';
  }
}

export function vaultErrorFromStatus(status: number): VaultError {
  if (status === 400 || status === 422) return new VaultError('invalid-request', { status });
  if (status === 401) return new VaultError('session-expired', { status });
  if (status === 403) return new VaultError('authorization', { status });
  if (status === 404) return new VaultError('not-found', { status });
  if (status === 409 || status === 412) return new VaultError('conflict', { status });
  if (status === 429) return new VaultError('rate-limited', { status });
  if (status >= 500) return new VaultError('unavailable', { status });
  return new VaultError('unknown', { status });
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
