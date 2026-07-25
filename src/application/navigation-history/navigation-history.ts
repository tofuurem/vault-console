import type { VaultSession } from '@/domain/vault/contracts';

export const RECENT_PATHS_STORAGE_KEY = 'vault-console.navigation.recents.v1';
export const SESSION_FAVORITES_STORAGE_KEY = 'vault-console.navigation.favorites.session.v1';
export const LOCAL_FAVORITES_STORAGE_PREFIX = 'vault-console.navigation.favorites.v1.';

const MAX_RECENTS = 20;
const MAX_FAVORITES = 100;

export interface NavigationStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface NavigationPath {
  readonly mount: string;
  readonly path: string;
  readonly kind: 'folder' | 'secret';
}

export interface RecentNavigationPath extends NavigationPath {
  readonly visitedAt: number;
}

export interface FavoriteNavigationPath extends NavigationPath {
  readonly pinnedAt: number;
}

interface StoredNavigationPaths<T> {
  readonly version: 1;
  readonly paths: readonly T[];
}

export interface StoredPathsResult<T> {
  readonly available: boolean;
  readonly paths: readonly T[];
}

function pathIdentity(path: NavigationPath): string {
  return `${path.mount}\u001f${path.kind}\u001f${path.path}`;
}

function validNavigationPath(value: unknown): value is NavigationPath {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Partial<NavigationPath>;
  return typeof candidate.mount === 'string'
    && candidate.mount.length > 0
    && candidate.mount.length <= 512
    && typeof candidate.path === 'string'
    && candidate.path.length > 0
    && candidate.path.length <= 4_096
    && (candidate.kind === 'folder' || candidate.kind === 'secret');
}

function validTimedPath<T extends NavigationPath>(
  value: unknown,
  timestamp: keyof T,
): value is T {
  if (!validNavigationPath(value)) return false;
  const time = (value as T)[timestamp];
  return typeof time === 'number' && Number.isFinite(time);
}

export function recordRecentPath(
  current: readonly RecentNavigationPath[],
  path: NavigationPath,
  visitedAt = Date.now(),
): readonly RecentNavigationPath[] {
  if (path.kind !== 'secret') return current;
  const next = { ...path, visitedAt };
  return [
    next,
    ...current.filter((candidate) => pathIdentity(candidate) !== pathIdentity(path)),
  ].slice(0, MAX_RECENTS);
}

export function toggleFavoritePath(
  current: readonly FavoriteNavigationPath[],
  path: NavigationPath,
  pinnedAt = Date.now(),
): readonly FavoriteNavigationPath[] {
  const exists = current.some((candidate) => pathIdentity(candidate) === pathIdentity(path));
  if (exists) {
    return current.filter((candidate) => pathIdentity(candidate) !== pathIdentity(path));
  }
  return [
    { ...path, pinnedAt },
    ...current,
  ].slice(0, MAX_FAVORITES);
}

export function hasFavoritePath(
  current: readonly FavoriteNavigationPath[],
  path: NavigationPath,
): boolean {
  return current.some((candidate) => pathIdentity(candidate) === pathIdentity(path));
}

export function readRecentPaths(
  storage: NavigationStorage | null,
): StoredPathsResult<RecentNavigationPath> {
  return readPaths(
    storage,
    RECENT_PATHS_STORAGE_KEY,
    (value) => validTimedPath<RecentNavigationPath>(value, 'visitedAt'),
    MAX_RECENTS,
  );
}

export function readFavoritePaths(
  storage: NavigationStorage | null,
  key: string,
): StoredPathsResult<FavoriteNavigationPath> {
  return readPaths(
    storage,
    key,
    (value) => validTimedPath<FavoriteNavigationPath>(value, 'pinnedAt'),
    MAX_FAVORITES,
  );
}

function readPaths<T>(
  storage: NavigationStorage | null,
  key: string,
  valid: (value: unknown) => value is T,
  limit: number,
): StoredPathsResult<T> {
  if (!storage) return { available: false, paths: [] };
  try {
    const raw = storage.getItem(key);
    if (!raw) return { available: true, paths: [] };
    const parsed = JSON.parse(raw) as Partial<StoredNavigationPaths<unknown>>;
    if (parsed.version !== 1 || !Array.isArray(parsed.paths)) {
      storage.removeItem(key);
      return { available: true, paths: [] };
    }
    return {
      available: true,
      paths: parsed.paths.filter(valid).slice(0, limit),
    };
  } catch {
    return { available: false, paths: [] };
  }
}

export function writeNavigationPaths(
  storage: NavigationStorage | null,
  key: string,
  paths: readonly RecentNavigationPath[] | readonly FavoriteNavigationPath[],
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(key, JSON.stringify({ version: 1, paths }));
    return true;
  } catch {
    return false;
  }
}

export function removeNavigationPaths(
  storage: NavigationStorage | null,
  key: string,
): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

type Digest = (value: Uint8Array) => Promise<ArrayBuffer>;

async function sha256(value: Uint8Array): Promise<ArrayBuffer> {
  if (!globalThis.crypto?.subtle) throw new DOMException('Web Crypto unavailable');
  return globalThis.crypto.subtle.digest('SHA-256', value);
}

export async function favoriteStorageScope(
  session: Pick<VaultSession, 'serverUrl' | 'authMethod' | 'displayName'>,
  digest: Digest = sha256,
): Promise<string | null> {
  if (session.authMethod !== 'userpass' || !session.displayName?.trim()) return null;
  try {
    const canonical = [
      new URL(session.serverUrl).toString().replace(/\/$/, ''),
      session.authMethod,
      session.displayName.trim(),
    ].join('\u001f');
    const hash = new Uint8Array(await digest(new TextEncoder().encode(canonical)));
    return [...hash.slice(0, 16)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

export function clearNavigationSessionStorage(
  storage: NavigationStorage | null,
): void {
  removeNavigationPaths(storage, RECENT_PATHS_STORAGE_KEY);
  removeNavigationPaths(storage, SESSION_FAVORITES_STORAGE_KEY);
}
