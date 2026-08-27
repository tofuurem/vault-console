import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import type { VaultSession } from '@/domain/vault/contracts';
import {
  favoriteStorageScope,
  hasFavoritePath,
  LOCAL_FAVORITES_STORAGE_PREFIX,
  readFavoritePaths,
  readRecentPaths,
  RECENT_PATHS_STORAGE_KEY,
  recordRecentPath,
  removeNavigationTargets,
  removeNavigationPaths,
  SESSION_FAVORITES_STORAGE_KEY,
  toggleFavoritePath,
  writeNavigationPaths,
  type FavoriteNavigationPath,
  type NavigationPath,
  type NavigationStorage,
} from './navigation-history';
import {
  NavigationHistoryContext,
  type NavigationHistoryContextValue,
} from './NavigationHistoryContext';

interface FavoriteStorageTarget {
  readonly storage: NavigationStorage | null;
  readonly key: string;
  readonly persistence: 'local' | 'session' | 'memory';
}

interface NavigationHistoryProviderProps {
  readonly children: ReactNode;
  readonly session: VaultSession;
  readonly sessionStorage?: NavigationStorage | null;
  readonly localStorage?: NavigationStorage | null;
}

function browserStorage(kind: 'localStorage' | 'sessionStorage'): Storage | null {
  try {
    return window[kind];
  } catch {
    return null;
  }
}

function mergeFavorites(
  first: readonly FavoriteNavigationPath[],
  second: readonly FavoriteNavigationPath[],
): readonly FavoriteNavigationPath[] {
  let merged = [...first];
  for (const favorite of second.slice().reverse()) {
    if (!hasFavoritePath(merged, favorite)) {
      merged = toggleFavoritePath(merged, favorite, favorite.pinnedAt) as FavoriteNavigationPath[];
    }
  }
  return merged;
}

export function NavigationHistoryProvider({
  children,
  session,
  sessionStorage: suppliedSessionStorage,
  localStorage: suppliedLocalStorage,
}: NavigationHistoryProviderProps) {
  const [tabStorage] = useState(
    () => suppliedSessionStorage === undefined
      ? browserStorage('sessionStorage')
      : suppliedSessionStorage,
  );
  const [persistentStorage] = useState(
    () => suppliedLocalStorage === undefined
      ? browserStorage('localStorage')
      : suppliedLocalStorage,
  );
  const favoriteIdentity = useMemo(() => ({
    serverUrl: session.serverUrl,
    authMethod: session.authMethod,
    displayName: session.displayName,
  }), [
    session.authMethod,
    session.displayName,
    session.serverUrl,
  ]);
  const [recents, setRecents] = useState(() => readRecentPaths(tabStorage).paths);
  const [favorites, setFavorites] = useState<readonly FavoriteNavigationPath[]>(() => (
    session.authMethod === 'token'
      ? readFavoritePaths(tabStorage, SESSION_FAVORITES_STORAGE_KEY).paths
      : []
  ));
  const [favoriteTarget, setFavoriteTarget] = useState<FavoriteStorageTarget>(() => (
    session.authMethod === 'token'
      ? {
          storage: tabStorage,
          key: SESSION_FAVORITES_STORAGE_KEY,
          persistence: tabStorage ? 'session' : 'memory',
        }
      : {
          storage: null,
          key: '',
          persistence: 'memory',
        }
  ));
  const targetRef = useRef(favoriteTarget);
  const clearPendingRef = useRef(false);
  targetRef.current = favoriteTarget;

  useEffect(() => {
    let active = true;
    clearPendingRef.current = false;
    if (favoriteIdentity.authMethod === 'token') {
      const target: FavoriteStorageTarget = {
        storage: tabStorage,
        key: SESSION_FAVORITES_STORAGE_KEY,
        persistence: tabStorage ? 'session' : 'memory',
      };
      targetRef.current = target;
      setFavoriteTarget(target);
      setFavorites(readFavoritePaths(tabStorage, target.key).paths);
      return () => {
        active = false;
      };
    }

    void favoriteStorageScope(favoriteIdentity).then((scope) => {
      if (!active) return;
      const key = scope ? `${LOCAL_FAVORITES_STORAGE_PREFIX}${scope}` : '';
      const stored = scope
        ? readFavoritePaths(persistentStorage, key)
        : { available: false, paths: [] };
      const target: FavoriteStorageTarget = stored.available
        ? { storage: persistentStorage, key, persistence: 'local' }
        : { storage: null, key: '', persistence: 'memory' };
      targetRef.current = target;
      setFavoriteTarget(target);
      if (clearPendingRef.current) {
        if (target.storage && target.key) removeNavigationPaths(target.storage, target.key);
        setFavorites([]);
        return;
      }
      setFavorites((current) => {
        const merged = mergeFavorites(stored.paths, current);
        if (target.storage) writeNavigationPaths(target.storage, target.key, merged);
        return merged;
      });
    });
    return () => {
      active = false;
    };
  }, [favoriteIdentity, persistentStorage, tabStorage]);

  const recordRecent = useCallback((path: NavigationPath) => {
    setRecents((current) => {
      const next = recordRecentPath(current, path);
      writeNavigationPaths(tabStorage, RECENT_PATHS_STORAGE_KEY, next);
      return next;
    });
  }, [tabStorage]);
  const toggleFavorite = useCallback((path: NavigationPath) => {
    setFavorites((current) => {
      const next = toggleFavoritePath(current, path);
      const target = targetRef.current;
      if (target.storage && target.key) {
        writeNavigationPaths(target.storage, target.key, next);
      }
      return next;
    });
  }, []);
  const isFavorite = useCallback(
    (path: NavigationPath) => hasFavoritePath(favorites, path),
    [favorites],
  );
  const removeSecretPaths = useCallback((mount: string, paths: readonly string[]) => {
    const targets = paths.map((path) => ({ mount, path, kind: 'secret' as const }));
    setRecents((current) => {
      const next = removeNavigationTargets(current, targets);
      writeNavigationPaths(tabStorage, RECENT_PATHS_STORAGE_KEY, next);
      return next;
    });
    setFavorites((current) => {
      const next = removeNavigationTargets(current, targets);
      const target = targetRef.current;
      if (target.storage && target.key) {
        writeNavigationPaths(target.storage, target.key, next);
      }
      return next;
    });
  }, [tabStorage]);
  const clearLocalNavigationData = useCallback(() => {
    clearPendingRef.current = true;
    removeNavigationPaths(tabStorage, RECENT_PATHS_STORAGE_KEY);
    removeNavigationPaths(tabStorage, SESSION_FAVORITES_STORAGE_KEY);
    const target = targetRef.current;
    if (target.storage && target.key) removeNavigationPaths(target.storage, target.key);
    setRecents([]);
    setFavorites([]);
  }, [tabStorage]);
  const value = useMemo<NavigationHistoryContextValue>(() => ({
    recents,
    favorites,
    persistence: favoriteTarget.persistence,
    recordRecent,
    toggleFavorite,
    isFavorite,
    removeSecretPaths,
    clearLocalNavigationData,
  }), [
    clearLocalNavigationData,
    favoriteTarget.persistence,
    favorites,
    isFavorite,
    removeSecretPaths,
    recents,
    recordRecent,
    toggleFavorite,
  ]);

  return (
    <NavigationHistoryContext.Provider value={value}>
      {children}
    </NavigationHistoryContext.Provider>
  );
}
