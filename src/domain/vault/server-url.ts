/**
 * Normalizes an operator-supplied Vault address to its origin plus optional
 * base path, without the `/v1` API prefix. Throws for non-HTTP schemes and
 * embedded credentials.
 */
export function normalizeVaultServerUrl(value: string): string {
  const url = new URL(value.trim());
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Invalid Vault address');
  }
  url.hash = '';
  url.search = '';
  url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '');
  return url.toString().replace(/\/$/, '');
}
