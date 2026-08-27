export function normalizeKvSecretPath(value: string): string {
  const trimmed = value.trim();
  return trimmed.startsWith('/') ? trimmed.slice(1) : trimmed;
}

export function kvSecretPathError(value: string): string | undefined {
  const trimmed = value.trim();
  const path = normalizeKvSecretPath(value);

  if (!path) return 'Enter a secret path.';
  if (path.length > 512) return 'Use at most 512 characters.';
  if (trimmed.endsWith('/')) return 'Enter a secret path, not a folder path.';
  if ([...path].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  })) return 'Control characters are not allowed.';

  const segments = path.split('/');
  if (segments.some((segment) => !segment)) {
    return 'Each path segment must have a name.';
  }
  if (segments.some((segment) => segment === '.' || segment === '..')) {
    return 'Relative path segments are not allowed.';
  }
  return undefined;
}
