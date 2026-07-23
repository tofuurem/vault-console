import { describe, expect, it } from 'vitest';

import { resolveRuntimeConfig } from './runtime-config';

describe('resolveRuntimeConfig', () => {
  it('uses fixed same-origin proxy defaults', () => {
    expect(resolveRuntimeConfig({})).toEqual({
      allowCustomVaultAddress: false,
      userpassMount: 'userpass',
      allowCustomUserpassMount: false,
    });
  });

  it('accepts explicit deployment controls and normalizes the userpass mount', () => {
    expect(resolveRuntimeConfig({
      allowCustomVaultAddress: true,
      userpassMount: '/team/userpass/',
      allowCustomUserpassMount: true,
    })).toEqual({
      allowCustomVaultAddress: true,
      userpassMount: 'team/userpass',
      allowCustomUserpassMount: true,
    });
  });

  it('falls back to the safe default for malformed values', () => {
    expect(resolveRuntimeConfig({
      allowCustomVaultAddress: 'yes',
      userpassMount: '../userpass',
      allowCustomUserpassMount: 1,
    })).toEqual({
      allowCustomVaultAddress: false,
      userpassMount: 'userpass',
      allowCustomUserpassMount: false,
    });
  });
});
