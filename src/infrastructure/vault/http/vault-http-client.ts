import {
  VaultError,
  normalizeVaultError,
  vaultErrorFromStatus,
  type VaultErrorDiagnostic,
} from '../../../domain/vault/errors';
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

function elapsedMilliseconds(startedAt: number): number {
  return Math.max(0, Math.round(performance.now() - startedAt));
}

function operationTemplate(method: VaultRequestOptions['method']): string {
  return `${method ?? 'GET'} /v1/:vault-path`;
}

function responseRequestId(response: Response): string | undefined {
  return response.headers.get('X-Vault-Request-Id')
    ?? response.headers.get('X-Request-Id')
    ?? undefined;
}

interface VaultErrorResponseSummary {
  readonly requestId?: string;
  readonly invalidToken: boolean;
  readonly casConflict: boolean;
}

function vaultErrorLines(value: unknown): readonly string[] {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return [];
  const errors = (value as { errors?: unknown }).errors;
  if (!Array.isArray(errors)) return [];
  return errors.flatMap((error) => (
    typeof error === 'string'
      ? error.split('\n').map((line) => line.trim().replace(/^\*+\s*/, '').trim().toLowerCase())
      : []
  ));
}

function isInvalidTokenError(value: unknown): boolean {
  return vaultErrorLines(value).includes('invalid token');
}

function isCasConflictError(value: unknown): boolean {
  return vaultErrorLines(value).some((line) => (
    line === 'check-and-set parameter did not match the current version'
  ));
}

async function errorResponseSummary(response: Response): Promise<VaultErrorResponseSummary> {
  try {
    const payload = await response.clone().json() as { request_id?: unknown };
    return {
      ...(typeof payload.request_id === 'string' ? { requestId: payload.request_id } : {}),
      invalidToken: isInvalidTokenError(payload),
      casConflict: isCasConflictError(payload),
    };
  } catch {
    return { invalidToken: false, casConflict: false };
  }
}

function diagnosticFor(
  options: VaultRequestOptions,
  startedAt: number,
  response?: Response,
  requestId?: string,
): VaultErrorDiagnostic {
  return {
    operation: operationTemplate(options.method),
    durationMs: elapsedMilliseconds(startedAt),
    retryCount: 0,
    requestId: requestId ?? (response ? responseRequestId(response) : undefined),
  };
}

function invalidVaultPath(): never {
  throw new VaultError('invalid-request');
}

function hasAsciiControl(value: string): boolean {
  return Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x1f || code === 0x7f;
  });
}

function assertLiteralVaultSegments(value: string): readonly string[] {
  if (hasAsciiControl(value)) return invalidVaultPath();
  const leadingSeparators = value.match(/^\/+/)?.[0].length ?? 0;
  const trailingSeparators = value.match(/\/+$/)?.[0].length ?? 0;
  if (leadingSeparators > 1 || trailingSeparators > 1) return invalidVaultPath();

  let normalized = value;
  if (normalized.startsWith('/')) normalized = normalized.slice(1);
  if (normalized.endsWith('/')) normalized = normalized.slice(0, -1);
  if (normalized === '') return [];

  const segments = normalized.split('/');
  if (segments.some((segment) => segment === '' || segment === '.' || segment === '..')) {
    return invalidVaultPath();
  }
  return segments;
}

function requestUrl(serverUrl: string, path: string): URL {
  const base = apiBaseUrl(serverUrl);
  const relativePath = path.replace(/^\/+/, '');
  if (hasAsciiControl(relativePath)) return invalidVaultPath();
  const segments = relativePath.split('/');
  if (segments.some((segment) => {
    if (segment === '') return true;
    try {
      const decoded = decodeURIComponent(segment);
      return decoded === '.'
        || decoded === '..'
        || hasAsciiControl(decoded);
    } catch {
      return true;
    }
  })) return invalidVaultPath();

  const url = new URL(relativePath, base);
  if (!url.pathname.startsWith(base.pathname)) return invalidVaultPath();
  return url;
}

export function encodeVaultPath(value: string): string {
  return assertLiteralVaultSegments(value)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

export class VaultHttpClient {
  private readonly fetchRequest: VaultFetch;

  constructor(fetchRequest: VaultFetch = globalThis.fetch.bind(globalThis)) {
    this.fetchRequest = fetchRequest;
  }

  async request(serverUrl: string, path: string, options: VaultRequestOptions = {}): Promise<unknown> {
    const startedAt = performance.now();
    try {
      const url = requestUrl(serverUrl, path);
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
        const summary = await errorResponseSummary(response);
        const requestId = responseRequestId(response) ?? summary.requestId;
        if (summary.invalidToken) {
          throw new VaultError('session-expired', {
            status: response.status,
            diagnostic: diagnosticFor(options, startedAt, response, requestId),
          });
        }
        if (summary.casConflict) {
          throw new VaultError('conflict', {
            status: response.status,
            diagnostic: diagnosticFor(options, startedAt, response, requestId),
          });
        }
        throw vaultErrorFromStatus(
          response.status,
          diagnosticFor(options, startedAt, response, requestId),
        );
      }
      if (response.status === 204) return null;

      try {
        return await response.json();
      } catch (error) {
        throw new VaultError('invalid-response', {
          cause: error,
          status: response.status,
          diagnostic: diagnosticFor(options, startedAt, response),
        });
      }
    } catch (error) {
      const normalized = normalizeVaultError(error);
      if (normalized.diagnostic) throw normalized;
      throw new VaultError(normalized.code, {
        cause: normalized,
        status: normalized.status,
        diagnostic: diagnosticFor(options, startedAt),
      });
    }
  }
}
