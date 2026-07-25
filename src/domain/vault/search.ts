export type KvPathKind = 'folder' | 'secret';

export interface KvPathEntry {
  readonly mount: string;
  readonly path: string;
  readonly name: string;
  readonly kind: KvPathKind;
}

export function normalizeKvDirectoryPath(path: string): string {
  const normalized = path
    .split('/')
    .filter(Boolean)
    .join('/');
  return normalized ? `${normalized}/` : '';
}

export function kvPathEntryFromListKey(
  mount: string,
  parentPath: string,
  key: string,
): KvPathEntry | null {
  const kind: KvPathKind = key.endsWith('/') ? 'folder' : 'secret';
  const relative = key.split('/').filter(Boolean).join('/');
  if (!relative) return null;
  const normalizedParent = normalizeKvDirectoryPath(parentPath);
  const path = `${normalizedParent}${relative}${kind === 'folder' ? '/' : ''}`;
  const name = relative.split('/').at(-1);
  if (!name) return null;
  return { mount, path, name, kind };
}
