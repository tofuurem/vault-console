import type { KvAccessTarget } from './kv-v2-policy-compiler';

export function normalizeLogicalKvTargetPath(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '');
}

export function logicalKvTargetPathError(
  value: string,
  target: KvAccessTarget,
): string | undefined {
  const path = normalizeLogicalKvTargetPath(value);
  if (target === 'secret' && !path) return 'Enter a secret path.';
  if (path.length > 512) return 'Use at most 512 characters.';
  if ([...path].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  })) return 'Control characters are not allowed.';
  const segments = path ? path.split('/') : [];
  if (segments.some((segment) => !segment)) return 'Each path segment must have a name.';
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return 'Relative path segments are not allowed.';
  }
  if (path.includes('*') || segments.includes('+')) {
    return 'Vault policy wildcards are not allowed in a logical target.';
  }
  return undefined;
}
