import type { VaultSession } from './contracts';
import { secretValueType, type SecretValueType } from './secret-json';
import {
  unwrappedSecretValue,
  type UnwrappedSecretValue,
  type VaultWrappingToken,
} from './sensitive-value';

export type WrapTtl = '5m' | '1h' | '24h';

export interface WrapTtlOption {
  readonly value: WrapTtl;
  readonly label: string;
  readonly seconds: number;
}

export const WRAP_TTL_OPTIONS: readonly WrapTtlOption[] = [
  { value: '5m', label: '5 minutes', seconds: 5 * 60 },
  { value: '1h', label: '1 hour', seconds: 60 * 60 },
  { value: '24h', label: '24 hours', seconds: 24 * 60 * 60 },
];

export const DEFAULT_WRAP_TTL: WrapTtl = '1h';

export function isWrapTtl(value: unknown): value is WrapTtl {
  return WRAP_TTL_OPTIONS.some((option) => option.value === value);
}

interface WrappingLifetime {
  readonly creationTime: string;
  readonly ttlSeconds: number;
}

/** The wrapping token returned once; Vault stores only the wrapped response. */
export interface WrappedSecretShare extends WrappingLifetime {
  readonly token: VaultWrappingToken;
  readonly creationPath: string;
}

export interface WrappingTokenInfo extends WrappingLifetime {
  readonly creationPath: string;
}

export interface UnwrappedSecretField {
  readonly key: string;
  readonly type: SecretValueType;
  readonly value: UnwrappedSecretValue;
}

export interface UnwrappedSecret {
  readonly fields: readonly UnwrappedSecretField[];
  /** Present when the wrapped response was a KV v2 read. */
  readonly version?: number;
  readonly createdTime?: string;
}

export interface VaultWrappingGateway {
  /** Reads one KV v2 version through response wrapping; the data never reaches the browser. */
  wrapKvSecretVersion(
    session: VaultSession,
    mount: string,
    path: string,
    version: number,
    ttl: WrapTtl,
    signal?: AbortSignal,
  ): Promise<WrappedSecretShare>;
  /** Does not consume the token. */
  lookupWrappingToken(serverUrl: string, token: VaultWrappingToken, signal?: AbortSignal): Promise<WrappingTokenInfo>;
  /** Consumes the token; it cannot be used again. */
  unwrapSecret(serverUrl: string, token: VaultWrappingToken, signal?: AbortSignal): Promise<UnwrappedSecret>;
}

export function wrappingExpiresAt(lifetime: WrappingLifetime): number | undefined {
  const created = Date.parse(lifetime.creationTime);
  if (!Number.isFinite(created) || !Number.isFinite(lifetime.ttlSeconds)) return undefined;
  return created + lifetime.ttlSeconds * 1_000;
}

export function normalizeWrappingToken(value: string): string {
  return value.trim();
}

/** Rejects pasted text that is clearly not a token before contacting Vault. */
export function isPlausibleWrappingToken(value: string): boolean {
  const token = normalizeWrappingToken(value);
  return token.length >= 8 && token.length <= 512 && /^[A-Za-z0-9._~+/=-]+$/.test(token);
}

function printableField(value: unknown): string {
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2) ?? String(value);
}

/** Converts unwrapped fields into memory-only values as soon as they are parsed. */
export function unwrappedSecretFields(
  data: Readonly<Record<string, unknown>>,
): readonly UnwrappedSecretField[] {
  return Object.entries(data).map(([key, value]) => ({
    key,
    type: secretValueType(value),
    value: unwrappedSecretValue(printableField(value)),
  }));
}
