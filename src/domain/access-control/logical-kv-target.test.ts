import { describe, expect, it } from 'vitest';

import {
  logicalKvTargetPathError,
  normalizeLogicalKvTargetPath,
} from './logical-kv-target';

describe('logical KV access target', () => {
  it('allows a future nested folder and normalizes surrounding slashes', () => {
    expect(normalizeLogicalKvTargetPath(' /future/database/ ')).toBe('future/database');
    expect(logicalKvTargetPathError('future/database', 'folder')).toBeUndefined();
  });

  it('requires a concrete secret and rejects policy syntax', () => {
    expect(logicalKvTargetPathError('', 'secret')).toBeTruthy();
    expect(logicalKvTargetPathError('future/*', 'folder')).toBeTruthy();
    expect(logicalKvTargetPathError('future/../database', 'folder')).toBeTruthy();
    expect(logicalKvTargetPathError('', 'folder')).toBeUndefined();
  });
});
