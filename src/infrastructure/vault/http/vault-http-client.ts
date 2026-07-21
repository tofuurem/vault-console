import { VaultError, normalizeVaultError, vaultErrorFromStatus } from '../../../domain/vault/errors';
import type { VaultToken } from '../../../domain/vault/sensitive-value';

export interface VaultRequestOptions {
  readonly method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  readonly token?: VaultToken;
  readonly query?: Readonly<Record<string, string | number | boolean | undefined>>;
  readonly body?: unknown;
  readonly signal?: AbortSignal;
  readonly allowStatuses?: readonly number[];
}

export type VaultFetch = typeof globalThis.fetch;

function apiBaseUrl(serverUrl: string): URL {
  try {
    const url = new URL(serverUrl);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') throw new Error('unsupported protocol');
    if (url.username || url.password) throw new Error('embedded credentials');
    url.hash = '';
    url.search = '';
    url.pathname = url.pathname.replace(/\/+$/, '').replace(/\/v1$/, '');
    url.pathname = `${url.pathname}/v1/`.replace(/\/{2,}/g, '/');
    return url;
  } catch (error) {
    throw new VaultError('invalid-request', { cause: error });
  }
}

export function encodeVaultPath(value: string): string {
  return value
    .replace(/^\/+|\/+$/g, '')
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export class VaultHttpClient {
  private readonly fetchRequest: VaultFetch;

  constructor(fetchRequest: VaultFetch = globalThis.fetch.bind(globalThis)) {
    this.fetchRequest = fetchRequest;
  }

  async request(serverUrl: string, path: string, options: VaultRequestOptions = {}): Promise<unknown> {
    try {
      const url = new URL(path.replace(/^\/+/, ''), apiBaseUrl(serverUrl));
      Object.entries(options.query ?? {}).forEach(([key, value]) => {
        if (value !== undefined) url.searchParams.set(key, String(value));
      });

      const headers = new Headers({
        Accept: 'application/json',
        'X-Vault-Request': 'true',
      });
      if (options.token) headers.set('X-Vault-Token', options.token.reveal());
      if (options.body !== undefined) headers.set('Content-Type', 'application/json');

      const response = await this.fetchRequest(url, {
        method: options.method ?? 'GET',
        headers,
        body: options.body === undefined ? undefined : JSON.stringify(options.body),
        signal: options.signal,
        cache: 'no-store',
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });

      if (!response.ok && !options.allowStatuses?.includes(response.status)) {
        throw vaultErrorFromStatus(response.status);
      }
      if (response.status === 204) return null;

      try {
        return await response.json();
      } catch (error) {
        throw new VaultError('invalid-response', { cause: error, status: response.status });
      }
    } catch (error) {
      throw normalizeVaultError(error);
    }
  }
}
