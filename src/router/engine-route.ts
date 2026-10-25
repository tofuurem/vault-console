export function engineRoute(mount: string, subPath = ''): string {
  const segments = [...mount.split('/'), ...subPath.split('/')]
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment));
  return `/engines/${segments.join('/')}`;
}

/** Splits a URL splat into the longest known mount and the remaining sub-path. */
export function resolveEngineRoute(
  splat: string,
  mounts: readonly string[],
): { readonly mount: string; readonly subPath: string } | undefined {
  const segments = splat.split('/').filter(Boolean).map((segment) => {
    try {
      return decodeURIComponent(segment);
    } catch {
      return segment;
    }
  });
  for (let length = segments.length; length > 0; length -= 1) {
    const candidate = segments.slice(0, length).join('/');
    if (mounts.includes(candidate)) {
      return { mount: candidate, subPath: segments.slice(length).join('/') };
    }
  }
  return undefined;
}
