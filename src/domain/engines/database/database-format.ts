import { formatTtlSeconds } from '@/domain/engines/engines';
import type { StaticRotation } from './database';

export function describeRotation(rotation: StaticRotation): string {
  if (rotation.kind === 'period') {
    return rotation.periodSeconds > 0 ? `Every ${formatTtlSeconds(rotation.periodSeconds)}` : 'Not scheduled';
  }
  const window = rotation.windowSeconds ? `, within ${formatTtlSeconds(rotation.windowSeconds)}` : '';
  return `Cron ${rotation.schedule}${window}`;
}

/** Role TTLs of 0 fall back to the engine's lease settings. */
export function ttlText(seconds: number): string {
  return seconds > 0 ? formatTtlSeconds(seconds) : 'Engine default';
}

export function describeAllowedRoles(roles: readonly string[]): string {
  if (roles.length === 0) return 'None, so no role can use it';
  if (roles.includes('*')) return 'Any role';
  return roles.join(', ');
}

/** Whether a connection's `allowed_roles` lets the named role use it. Supports `*` and globs like `app-*`. */
export function connectionAllowsRole(allowedRoles: readonly string[], role: string): boolean {
  return allowedRoles.some((pattern) => {
    if (pattern === '*') return true;
    if (!pattern.includes('*')) return pattern === role;
    const expression = pattern.split('*').map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*');
    return new RegExp(`^${expression}$`).test(role);
  });
}
