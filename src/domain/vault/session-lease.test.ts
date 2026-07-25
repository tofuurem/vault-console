import { describe, expect, it } from 'vitest';

import { leaseFromDuration, leaseFromLookup } from './session-lease';

describe('Vault session lease', () => {
  it('prefers the exact lookup expiry while retaining the reported TTL', () => {
    expect(leaseFromLookup({
      expireTime: '2030-01-02T03:04:05Z',
      ttlSeconds: 60,
      renewable: true,
    }, 100)).toEqual({
      expiresAt: Date.parse('2030-01-02T03:04:05Z'),
      leaseDurationSeconds: 60,
      renewable: true,
    });
  });

  it('derives a fixed expiry from TTL when lookup has no valid timestamp', () => {
    expect(leaseFromLookup({
      ttlSeconds: 30,
      renewable: false,
    }, 1_000)).toEqual({
      expiresAt: 31_000,
      leaseDurationSeconds: 30,
      renewable: false,
    });
  });

  it('keeps unknown renewability and no fixed expiry distinguishable', () => {
    expect(leaseFromLookup({}, 1_000)).toEqual({
      expiresAt: undefined,
      leaseDurationSeconds: undefined,
      renewable: undefined,
    });
    expect(leaseFromDuration({
      durationSeconds: 0,
      renewable: false,
    }, 1_000)).toEqual({
      expiresAt: undefined,
      leaseDurationSeconds: 0,
      renewable: false,
      renewedAt: undefined,
    });
  });

  it('uses the exact returned renewal duration even when it is shorter', () => {
    expect(leaseFromDuration({
      durationSeconds: 15,
      renewable: true,
      renewed: true,
    }, 10_000)).toEqual({
      expiresAt: 25_000,
      leaseDurationSeconds: 15,
      renewable: true,
      renewedAt: 10_000,
    });
  });
});
