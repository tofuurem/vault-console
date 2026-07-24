import { VaultError } from '@/domain/vault/errors';

export interface SafeDiagnosticRecord {
  readonly buildVersion: string;
  readonly route: string;
  readonly operation: string;
  readonly errorCode: string;
  readonly status?: number;
  readonly durationMs?: number;
  readonly retryCount?: number;
  readonly vaultRequestId?: string;
  readonly runtime: string;
  readonly viewport: 'compact' | 'medium' | 'wide';
}

function routeTemplate(pathname: string): string {
  if (pathname === '/login') return '/login';
  if (pathname === '/explorer') return '/explorer';
  if (pathname.startsWith('/explorer/')) return '/explorer/:mount/*';
  if (/^\/access-control\/users\/[^/]+/.test(pathname)) {
    return '/access-control/users/:username';
  }
  if (pathname.startsWith('/access-control/')) return '/access-control/:section';
  if (pathname === '/access-control') return '/access-control';
  return '/unknown';
}

function safeOperation(error: VaultError | undefined): string {
  const operation = error?.diagnostic?.operation;
  return /^(GET|POST|PUT|DELETE) \/v1\/:vault-path$/.test(operation ?? '')
    ? operation!
    : error ? 'Vault operation' : 'UI render';
}

function safeRequestId(value: string | undefined): string | undefined {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value ?? '')
    ? value
    : undefined;
}

function safeDuration(value: number | undefined): number | undefined {
  return Number.isFinite(value) ? Math.max(0, Math.min(Math.round(value!), 300_000)) : undefined;
}

function safeRetryCount(value: number | undefined): number | undefined {
  return Number.isInteger(value) ? Math.max(0, Math.min(value!, 10)) : undefined;
}

function runtimeLabel(userAgent: string): string {
  const browser = userAgent.match(/Edg\/([\d.]+)/)?.[1];
  if (browser) return `Edge ${browser}`;
  const chrome = userAgent.match(/Chrome\/([\d.]+)/)?.[1];
  if (chrome) return `Chrome ${chrome}`;
  const firefox = userAgent.match(/Firefox\/([\d.]+)/)?.[1];
  if (firefox) return `Firefox ${firefox}`;
  const safari = userAgent.match(/Version\/([\d.]+).*Safari/)?.[1];
  if (safari) return `Safari ${safari}`;
  return 'Browser unavailable';
}

function viewportClass(width: number): SafeDiagnosticRecord['viewport'] {
  if (width < 768) return 'compact';
  if (width < 1280) return 'medium';
  return 'wide';
}

export function createSafeDiagnostic(
  cause: unknown,
  pathname: string,
  environment: {
    readonly userAgent?: string;
    readonly viewportWidth?: number;
    readonly buildVersion?: string;
  } = {},
): SafeDiagnosticRecord {
  const error = cause instanceof VaultError ? cause : undefined;
  return {
    buildVersion: environment.buildVersion ?? 'development',
    route: routeTemplate(pathname),
    operation: safeOperation(error),
    errorCode: error?.code ?? 'render-failure',
    status: Number.isInteger(error?.status) ? error?.status : undefined,
    durationMs: safeDuration(error?.diagnostic?.durationMs),
    retryCount: safeRetryCount(error?.diagnostic?.retryCount),
    vaultRequestId: safeRequestId(error?.diagnostic?.requestId),
    runtime: runtimeLabel(environment.userAgent ?? navigator.userAgent),
    viewport: viewportClass(environment.viewportWidth ?? window.innerWidth),
  };
}

export function serializeSafeDiagnostic(record: SafeDiagnosticRecord): string {
  return JSON.stringify(record, null, 2);
}
