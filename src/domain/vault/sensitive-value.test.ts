import { describe, expect, it } from 'vitest';

import { vaultPassword, vaultToken } from './sensitive-value';

describe('sensitive Vault values', () => {
  it('requires explicit reveal and redacts string and JSON representations', () => {
    const token = vaultToken('hvs.do-not-log');
    const password = vaultPassword('do-not-log-password');

    expect(token.reveal()).toBe('hvs.do-not-log');
    expect(String(token)).toBe('[REDACTED]');
    expect(JSON.stringify({ token, password })).toBe(
      JSON.stringify({ token: '[REDACTED]', password: '[REDACTED]' }),
    );
  });
});
