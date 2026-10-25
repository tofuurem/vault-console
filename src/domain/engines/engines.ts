import type { VaultSession } from '@/domain/vault/contracts';

/** Engines with a dedicated console workspace; everything else uses the generic browser. */
export type EngineKind = 'kv-v2' | 'database' | 'transit' | 'pki' | 'ssh' | 'other';

export interface SecretEngine {
  /** Mount path without trailing slash, e.g. `db` or `pki/int`. */
  readonly path: string;
  /** Raw Vault engine type, e.g. `database`, `kv`, `aws`. */
  readonly type: string;
  readonly kind: EngineKind;
  readonly description: string;
  readonly accessor: string;
  readonly version?: string;
}

export function engineKind(type: string, options: Readonly<Record<string, unknown>> = {}): EngineKind {
  if (type === 'kv') return options.version === '2' ? 'kv-v2' : 'other';
  if (type === 'database' || type === 'transit' || type === 'pki' || type === 'ssh') return type;
  return 'other';
}

export interface EngineCatalogEntry {
  readonly type: string;
  readonly kind: EngineKind;
  readonly label: string;
  readonly description: string;
  readonly icon: string;
  readonly defaultPath: string;
  /** Extra mount options Vault needs for this type. */
  readonly options?: Readonly<Record<string, string>>;
}

/** Engines operators can enable from the console. */
export const ENGINE_CATALOG: readonly EngineCatalogEntry[] = [
  {
    type: 'kv',
    kind: 'kv-v2',
    label: 'Key/value (KV v2)',
    description: 'Versioned static secrets with metadata.',
    icon: 'ri-folder-keyhole-line',
    defaultPath: 'secret',
    options: { version: '2' },
  },
  {
    type: 'database',
    kind: 'database',
    label: 'Database',
    description: 'Short-lived or rotated credentials for PostgreSQL, MySQL, and other databases.',
    icon: 'ri-database-2-line',
    defaultPath: 'database',
  },
  {
    type: 'transit',
    kind: 'transit',
    label: 'Transit',
    description: 'Encryption, signing, and HMAC as a service; keys never leave Vault.',
    icon: 'ri-lock-password-line',
    defaultPath: 'transit',
  },
  {
    type: 'pki',
    kind: 'pki',
    label: 'PKI',
    description: 'A certificate authority that issues and revokes X.509 certificates.',
    icon: 'ri-shield-keyhole-line',
    defaultPath: 'pki',
  },
  {
    type: 'ssh',
    kind: 'ssh',
    label: 'SSH',
    description: 'Signed SSH certificates and one-time passwords for hosts.',
    icon: 'ri-terminal-box-line',
    defaultPath: 'ssh',
  },
];

export function engineIcon(kind: EngineKind): string {
  return ENGINE_CATALOG.find((entry) => entry.kind === kind)?.icon ?? 'ri-instance-line';
}

export function engineLabel(engine: Pick<SecretEngine, 'kind' | 'type'>): string {
  return ENGINE_CATALOG.find((entry) => entry.kind === engine.kind)?.label ?? engine.type;
}

export interface EngineTune {
  readonly description: string;
  readonly defaultLeaseTtlSeconds: number;
  readonly maxLeaseTtlSeconds: number;
}

export interface EnableEngineInput {
  readonly path: string;
  readonly type: string;
  readonly description: string;
  readonly options?: Readonly<Record<string, string>>;
  /** Vault duration strings such as `720h`; empty keeps the system default. */
  readonly defaultLeaseTtl?: string;
  readonly maxLeaseTtl?: string;
}

export interface TuneEngineInput {
  readonly description: string;
  readonly defaultLeaseTtl: string;
  readonly maxLeaseTtl: string;
}

export interface SecretEnginesGateway {
  listEngines(session: VaultSession, signal?: AbortSignal): Promise<readonly SecretEngine[]>;
  enableEngine(session: VaultSession, input: EnableEngineInput, signal?: AbortSignal): Promise<void>;
  readTune(session: VaultSession, path: string, signal?: AbortSignal): Promise<EngineTune>;
  tuneEngine(session: VaultSession, path: string, input: TuneEngineInput, signal?: AbortSignal): Promise<void>;
  disableEngine(session: VaultSession, path: string, signal?: AbortSignal): Promise<void>;
}

/** A generic Vault response as seen by the raw path browser. */
export interface VaultApiResponse {
  readonly data: Readonly<Record<string, unknown>> | null;
  readonly leaseId?: string;
  readonly leaseDurationSeconds?: number;
  readonly renewable?: boolean;
  readonly warnings: readonly string[];
}

/** Raw, path-relative access used by the generic engine browser. */
export interface VaultApiGateway {
  list(session: VaultSession, path: string, signal?: AbortSignal): Promise<readonly string[]>;
  read(session: VaultSession, path: string, signal?: AbortSignal): Promise<VaultApiResponse | null>;
  write(
    session: VaultSession,
    path: string,
    body: Readonly<Record<string, unknown>>,
    signal?: AbortSignal,
  ): Promise<VaultApiResponse | null>;
  remove(session: VaultSession, path: string, signal?: AbortSignal): Promise<void>;
}

const DURATION = /^(\d+(\.\d+)?(ns|us|µs|ms|s|m|h))+$|^\d+$/;

/** Accepts the Go-style durations Vault parses (`30s`, `1h30m`, `720h`) or plain seconds. */
export function durationError(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return DURATION.test(trimmed) ? undefined : 'Use a duration such as 30m, 24h, or 720h.';
}

/** Human-friendly rendering of a TTL in seconds; 0 means the system default. */
export function formatTtlSeconds(seconds: number): string {
  if (seconds <= 0) return 'System default';
  const units: readonly (readonly [number, string])[] = [[86_400, 'd'], [3_600, 'h'], [60, 'm'], [1, 's']];
  const parts: string[] = [];
  let remaining = Math.round(seconds);
  for (const [size, unit] of units) {
    if (remaining >= size) {
      parts.push(`${Math.floor(remaining / size)}${unit}`);
      remaining %= size;
    }
  }
  return parts.slice(0, 2).join(' ');
}

/** Joins a mount and a relative API path without doubled or trailing slashes. */
export function enginePath(mount: string, relative = ''): string {
  return [mount, relative].map((part) => part.replace(/^\/+|\/+$/g, '')).filter(Boolean).join('/');
}
