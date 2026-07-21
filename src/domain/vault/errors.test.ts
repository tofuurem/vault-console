import { describe, expect, it } from 'vitest';

import { VaultError, normalizeVaultError, vaultErrorFromStatus } from './errors';

describe('vault errors', () => {
  it.each([
    [401, 'session-expired'],
    [403, 'authorization'],
    [404, 'not-found'],
    [409, 'conflict'],
    [412, 'conflict'],
    [429, 'rate-limited'],
    [503, 'unavailable'],
  ] as const)('maps HTTP %s to %s without using a response body', (status, code) => {
    const error = vaultErrorFromStatus(status);

    expect(error.code).toBe(code);
    expect(error.status).toBe(status);
    expect(error.message).not.toContain(String(status));
    expect(error.cause).toBeUndefined();
  });

  it('marks only transient failures as retryable', () => {
    expect(vaultErrorFromStatus(429).retryable).toBe(true);
    expect(vaultErrorFromStatus(503).retryable).toBe(true);
    expect(vaultErrorFromStatus(403).retryable).toBe(false);
  });

  it('normalizes cancelled and transport failures', () => {
    expect(normalizeVaultError(new DOMException('cancelled', 'AbortError')).code).toBe('aborted');
    expect(normalizeVaultError(new TypeError('network payload that must stay hidden')).code).toBe('unavailable');
  });

  it('preserves an already classified Vault error', () => {
    const original = new VaultError('sealed');

    expect(normalizeVaultError(original)).toBe(original);
  });
});
