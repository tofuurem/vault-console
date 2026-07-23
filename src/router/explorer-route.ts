export function directoryPathFromWildcard(wildcard: string | undefined): string {
  const segments = (wildcard ?? '').split('/').filter(Boolean);
  return segments.length ? `${segments.join('/')}/` : '';
}

export function explorerRoute(
  mount: string,
  directoryPath = '',
  selectedSecret?: string | null,
): string {
  const directorySegments = directoryPath.split('/').filter(Boolean).map(encodeURIComponent);
  const pathname = ['/explorer', encodeURIComponent(mount), ...directorySegments].join('/');
  const directorySuffix = directorySegments.length ? '/' : '';
  if (!selectedSecret) return `${pathname}${directorySuffix}`;
  return `${pathname}${directorySuffix}?${new URLSearchParams({ secret: selectedSecret })}`;
}
