import { describe, expect, it } from 'vitest';

import {
  isPlausibleWrappingToken,
  isWrapTtl,
  unwrappedSecretFields,
  wrappingExpiresAt,
} from './wrapping';

describe('response wrapping helpers', () => {
  it('computes the expiry from creation time and TTL', () => {
    expect(wrappingExpiresAt({ creationTime: '2026-10-25T10:00:00Z', ttlSeconds: 300 }))
      .toBe(Date.parse('2026-10-25T10:05:00Z'));
    expect(wrappingExpiresAt({ creationTime: 'not a date', ttlSeconds: 300 })).toBeUndefined();
  });

  it('accepts only the offered TTLs', () => {
    expect(['5m', '1h', '24h'].every(isWrapTtl)).toBe(true);
    expect(isWrapTtl('7d')).toBe(false);
  });

  it('screens pasted tokens locally', () => {
    expect(isPlausibleWrappingToken('  hvs.CAESIJ0e2Wm  ')).toBe(true);
    expect(isPlausibleWrappingToken('short')).toBe(false);
    expect(isPlausibleWrappingToken('two words here')).toBe(false);
  });

  it('keeps unwrapped values out of serialization', () => {
    const fields = unwrappedSecretFields({ API_KEY: 'value-1', PORT: 5432 });
    expect(fields.map((field) => [field.key, field.type, field.value.reveal()])).toEqual([
      ['API_KEY', 'string', 'value-1'],
      ['PORT', 'number', '5432'],
    ]);
    expect(JSON.stringify(fields)).not.toContain('value-1');
    expect(String(fields[0].value)).toBe('[REDACTED]');
  });
});
