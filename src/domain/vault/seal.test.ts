import { describe, expect, it } from 'vitest';

import {
  classifyUnsealSubmission,
  isPlausibleUnsealKeyShare,
  normalizeUnsealKeyShare,
  remainingShares,
  unsealPhase,
  type VaultSealStatus,
} from './seal';

const sealed: VaultSealStatus = {
  type: 'shamir',
  initialized: true,
  sealed: true,
  threshold: 3,
  shares: 5,
  progress: 0,
  migration: false,
  recoverySeal: false,
};

describe('unsealPhase', () => {
  it('distinguishes every operator-visible state', () => {
    expect(unsealPhase({ ...sealed, initialized: false })).toBe('uninitialized');
    expect(unsealPhase({ ...sealed, sealed: false })).toBe('unsealed');
    expect(unsealPhase({ ...sealed, type: 'auto' })).toBe('auto-unseal');
    expect(unsealPhase({ ...sealed, type: 'auto', migration: true })).toBe('awaiting-shares');
    expect(unsealPhase(sealed)).toBe('awaiting-shares');
  });

  it('never reports negative remaining shares', () => {
    expect(remainingShares({ ...sealed, progress: 1 })).toBe(2);
    expect(remainingShares({ ...sealed, progress: 4 })).toBe(0);
  });
});

describe('classifyUnsealSubmission', () => {
  it('detects completion, progress, duplicates and Vault resets', () => {
    const first = { ...sealed, progress: 1, nonce: 'n-1' };
    expect(classifyUnsealSubmission(first, { ...first, sealed: false, progress: 0 })).toBe('unsealed');
    expect(classifyUnsealSubmission(sealed, first)).toBe('accepted');
    expect(classifyUnsealSubmission(first, { ...first, progress: 2 })).toBe('accepted');
    expect(classifyUnsealSubmission(first, first)).toBe('duplicate');
    expect(classifyUnsealSubmission({ ...first, progress: 2 }, { ...sealed, progress: 0 })).toBe('reset-by-vault');
    expect(classifyUnsealSubmission(undefined, first)).toBe('accepted');
  });
});

describe('unseal key share format', () => {
  it('accepts the hex and base64 encodings returned by vault operator init', () => {
    expect(isPlausibleUnsealKeyShare('9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08aa')).toBe(true);
    expect(isPlausibleUnsealKeyShare('n4bQgYhMfWWaL+qgxVrQFaO/TxsrC4Is0V1sFbDwCgiq')).toBe(true);
  });

  it('ignores surrounding and embedded whitespace from copy and paste', () => {
    expect(normalizeUnsealKeyShare('  abcd ef01\n2345 ')).toBe('abcdef012345');
    expect(isPlausibleUnsealKeyShare(' 9f86d081884c7d65\n9a2feaa0c55ad015 ')).toBe(true);
  });

  it('rejects values that cannot be a key share', () => {
    expect(isPlausibleUnsealKeyShare('')).toBe(false);
    expect(isPlausibleUnsealKeyShare('short')).toBe(false);
    expect(isPlausibleUnsealKeyShare('not a key share at all!')).toBe(false);
    expect(isPlausibleUnsealKeyShare('abc')).toBe(false);
  });
});
