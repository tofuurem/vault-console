import { describe, expect, it } from 'vitest';

import {
  durationError,
  engineKind,
  engineLabel,
  enginePath,
  formatTtlSeconds,
  secondsToDuration,
} from './engines';

describe('engines', () => {
  it('classifies mount types into console workspaces', () => {
    expect(engineKind('kv', { version: '2' })).toBe('kv-v2');
    expect(engineKind('kv', { version: '1' })).toBe('other');
    expect(engineKind('database')).toBe('database');
    expect(engineKind('pki')).toBe('pki');
    expect(engineKind('aws')).toBe('other');
    expect(engineLabel({ kind: 'other', type: 'aws' })).toBe('aws');
    expect(engineLabel({ kind: 'transit', type: 'transit' })).toBe('Transit');
  });

  it('validates Vault durations and formats TTLs', () => {
    expect(durationError('')).toBeUndefined();
    expect(durationError('720h')).toBeUndefined();
    expect(durationError('1h30m')).toBeUndefined();
    expect(durationError('3600')).toBeUndefined();
    expect(durationError('two days')).toMatch(/duration/);
    expect(formatTtlSeconds(0)).toBe('System default');
    expect(formatTtlSeconds(2_764_800)).toBe('32d');
    expect(formatTtlSeconds(5_400)).toBe('1h 30m');
  });

  it('joins mount-relative API paths', () => {
    expect(enginePath('db/', '/roles/')).toBe('db/roles');
    expect(enginePath('pki')).toBe('pki');
  });

  it('renders TTL seconds as the shortest whole-unit duration', () => {
    expect(secondsToDuration(2_764_800)).toBe('768h');
    expect(secondsToDuration(90)).toBe('90s');
    expect(secondsToDuration(1_800)).toBe('30m');
    expect(secondsToDuration(0)).toBe('');
  });
});
