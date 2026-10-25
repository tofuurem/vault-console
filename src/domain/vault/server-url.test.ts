import { describe, expect, it } from 'vitest';

import { normalizeVaultServerUrl } from './server-url';

describe('normalizeVaultServerUrl', () => {
  it('strips the API prefix, query, hash and trailing slashes', () => {
    expect(normalizeVaultServerUrl(' https://vault.example.test/v1/?x=1#y ')).toBe('https://vault.example.test');
    expect(normalizeVaultServerUrl('https://example.test/vault/')).toBe('https://example.test/vault');
  });

  it('rejects unsupported schemes and embedded credentials', () => {
    expect(() => normalizeVaultServerUrl('ftp://vault.example.test')).toThrow();
    expect(() => normalizeVaultServerUrl('https://user:pass@vault.example.test')).toThrow();
    expect(() => normalizeVaultServerUrl('not a url')).toThrow();
  });
});
