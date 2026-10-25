import { describe, expect, it } from 'vitest';

import { resolveRuntimeConfig } from './runtime-config';

describe('resolveRuntimeConfig', () => {
  it('uses fixed same-origin proxy defaults', () => {
    expect(resolveRuntimeConfig({})).toMatchObject({
      environmentName: '',
      environmentTone: 'neutral',
      auditAvailable: false,
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
    })).toMatchObject({
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
    })).toMatchObject({
      allowCustomVaultAddress: false,
      userpassMount: 'userpass',
      allowCustomUserpassMount: false,
    });
  });

  it('accepts a short environment label and tone and rejects unsafe values', () => {
    expect(resolveRuntimeConfig({ environmentName: ' Prod EU ', environmentTone: 'danger' })).toMatchObject({
      environmentName: 'Prod EU',
      environmentTone: 'danger',
    });
    expect(resolveRuntimeConfig({ environmentName: '<script>', environmentTone: 'loud' })).toMatchObject({
      environmentName: '',
      environmentTone: 'neutral',
    });
    expect(resolveRuntimeConfig({ environmentName: 'x'.repeat(25) }).environmentName).toBe('');
  });
});
