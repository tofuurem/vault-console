export interface CreateKvV2Mount {
  readonly path: string;
  readonly description: string;
}

export function normalizeKvMountPath(value: string): string {
  return value.trim().replace(/^\/+|\/+$/g, '');
}

export function kvMountPathError(value: string): string | undefined {
  const path = normalizeKvMountPath(value);
  if (!path) return 'Enter a mount path.';
  if (path.length > 128) return 'Use at most 128 characters.';
  if (!/^[A-Za-z0-9][A-Za-z0-9._~/-]*$/.test(path)) {
    return 'Use letters, numbers, dots, underscores, hyphens, tildes, and slashes.';
  }
  const segments = path.split('/');
  if (segments.some((segment) => !segment || segment === '.' || segment === '..')) {
    return 'Each path segment must have a name.';
  }
  return undefined;
}
