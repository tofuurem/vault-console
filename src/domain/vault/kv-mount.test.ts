import { describe, expect, it } from 'vitest';

import {
  kvMountPathError,
  normalizeKvMountPath,
} from './kv-mount';

describe('KV v2 mount path', () => {
  it('normalizes surrounding whitespace and slashes without changing nested segments', () => {
    expect(normalizeKvMountPath(' /team/platform/ ')).toBe('team/platform');
  });

  it('rejects ambiguous or unsafe mount paths before calling Vault', () => {
    expect(kvMountPathError('')).toBeTruthy();
    expect(kvMountPathError('team//platform')).toBeTruthy();
    expect(kvMountPathError('team/../platform')).toBeTruthy();
    expect(kvMountPathError('team platform')).toBeTruthy();
    expect(kvMountPathError('team/platform')).toBeUndefined();
  });
});
