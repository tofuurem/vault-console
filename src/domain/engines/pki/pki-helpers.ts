import { durationError } from '@/domain/engines/engines';
import type { PkiIssuerSummary, PkiRole, PkiRoleInput } from './pki';

const DAY_MS = 86_400_000;

export const EXPIRY_WARNING_DAYS = 30;

export type ExpiryState = 'expired' | 'expiring' | 'valid' | 'not-yet-valid';

export interface Validity {
  /** Epoch milliseconds. */
  readonly notBefore: number;
  readonly notAfter: number;
}

export function isExpired(notAfter: number, now = Date.now()): boolean {
  return notAfter <= now;
}

/** True when the certificate is still valid but ends within `days`. */
export function expiresWithin(notAfter: number, days: number, now = Date.now()): boolean {
  return !isExpired(notAfter, now) && notAfter - now <= days * DAY_MS;
}

export function expiryState(validity: Validity, now = Date.now(), warningDays = EXPIRY_WARNING_DAYS): ExpiryState {
  if (isExpired(validity.notAfter, now)) return 'expired';
  if (validity.notBefore > now) return 'not-yet-valid';
  if (expiresWithin(validity.notAfter, warningDays, now)) return 'expiring';
  return 'valid';
}

/** Whole days until expiry; negative once expired. */
export function daysUntil(notAfter: number, now = Date.now()): number {
  return Math.floor((notAfter - now) / DAY_MS);
}

/** Splits comma- or newline-separated input into trimmed, unique entries. */
export function splitList(value: string | undefined): readonly string[] {
  if (!value) return [];
  return [...new Set(value.split(/[,\n]/).map((item) => item.trim()).filter(Boolean))];
}

export function joinList(values: readonly string[]): string {
  return values.join(', ');
}

const IPV4 = /^(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)(\.(25[0-5]|2[0-4]\d|1\d\d|[1-9]?\d)){3}$/;

function isIpv6(value: string): boolean {
  if (!/^[0-9a-fA-F:.]+$/.test(value) || !value.includes(':')) return false;
  const doubleColons = value.split('::').length - 1;
  if (doubleColons > 1) return false;
  const groups = value.split(':').filter(Boolean);
  const last = groups[groups.length - 1] ?? '';
  const embeddedIpv4 = last.includes('.');
  if (embeddedIpv4 && !IPV4.test(last)) return false;
  const hexGroups = embeddedIpv4 ? groups.slice(0, -1) : groups;
  if (hexGroups.some((group) => !/^[0-9a-fA-F]{1,4}$/.test(group))) return false;
  const size = hexGroups.length + (embeddedIpv4 ? 2 : 0);
  return doubleColons === 1 ? size < 8 : size === 8;
}

export function isIpAddress(value: string): boolean {
  return IPV4.test(value) || isIpv6(value);
}

/** Validates comma-separated IP SANs. */
export function ipListError(value: string | undefined): string | undefined {
  const invalid = splitList(value).find((item) => !isIpAddress(item));
  return invalid ? `${invalid} is not an IP address.` : undefined;
}

export function requiredError(value: string | undefined, label: string): string | undefined {
  return value?.trim() ? undefined : `Enter ${label}.`;
}

/** A Vault duration that may be empty (empty uses the role or mount default). */
export function ttlError(value: string | undefined): string | undefined {
  return durationError(value ?? '');
}

/** Serial numbers compare without colons or case. */
export function normalizeSerial(value: string): string {
  return value.replace(/[^0-9a-fA-F]/g, '').toLowerCase();
}

/** Matches a certificate row against a search by serial or common name. */
export function certificateMatches(query: string, serialNumber: string, commonName?: string): boolean {
  const needle = query.trim().toLowerCase();
  if (!needle) return true;
  const serialNeedle = normalizeSerial(needle);
  if (serialNeedle && normalizeSerial(serialNumber).includes(serialNeedle)) return true;
  return Boolean(commonName?.toLowerCase().includes(needle));
}

/** Formats TTL seconds as a short Vault duration such as `720h`; 0 becomes empty. */
export function secondsToDuration(seconds: number): string {
  if (!seconds || seconds <= 0) return '';
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

export function issuerLabel(issuer: Pick<PkiIssuerSummary, 'id' | 'name'>): string {
  return issuer.name || issuer.id.slice(0, 8);
}

export const EMPTY_ROLE_INPUT: PkiRoleInput = {
  issuerRef: 'default',
  allowedDomains: [],
  allowSubdomains: false,
  allowBareDomains: false,
  allowGlobDomains: false,
  allowAnyName: false,
  allowLocalhost: true,
  allowIpSans: true,
  serverFlag: true,
  clientFlag: true,
  keyType: 'rsa',
  keyBits: 2048,
  ttl: '',
  maxTtl: '',
  noStore: false,
  requireCn: true,
  extKeyUsage: [],
  organization: [],
  ou: [],
};

export function roleToInput(role: PkiRole): PkiRoleInput {
  const { name: _name, ttlSeconds, maxTtlSeconds, ...rest } = role;
  return { ...rest, ttl: secondsToDuration(ttlSeconds), maxTtl: secondsToDuration(maxTtlSeconds) };
}

const ROLE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function roleNameError(name: string, existing: readonly string[] = []): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a role name.';
  if (!ROLE_NAME.test(trimmed)) return 'Use letters, numbers, dots, dashes, and underscores.';
  if (existing.includes(trimmed)) return 'A role with this name already exists.';
  return undefined;
}

/** Names Vault accepts for issuers and keys; empty is allowed. */
export function issuerNameError(name: string): string | undefined {
  const trimmed = name.trim();
  if (!trimmed) return undefined;
  if (trimmed === 'default') return '"default" is reserved.';
  return /^[A-Za-z0-9_-]+$/.test(trimmed) ? undefined : 'Use letters, numbers, dashes, and underscores.';
}

/** A short description of what a role allows, for list rows. */
export function roleDomainSummary(role: Pick<PkiRole, 'allowAnyName' | 'allowedDomains' | 'allowSubdomains' | 'allowBareDomains' | 'allowGlobDomains'>): string {
  if (role.allowAnyName) return 'Any name';
  if (role.allowedDomains.length === 0) return 'No domains allowed';
  const modes = [
    role.allowBareDomains ? 'bare' : undefined,
    role.allowSubdomains ? 'subdomains' : undefined,
    role.allowGlobDomains ? 'globs' : undefined,
  ].filter(Boolean);
  return `${joinList(role.allowedDomains)}${modes.length ? ` (${modes.join(', ')})` : ''}`;
}
