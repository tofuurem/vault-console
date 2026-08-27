import { createContext, useContext } from 'react';

import type {
  FavoriteNavigationPath,
  NavigationPath,
  RecentNavigationPath,
} from './navigation-history';

export interface NavigationHistoryContextValue {
  readonly recents: readonly RecentNavigationPath[];
  readonly favorites: readonly FavoriteNavigationPath[];
  readonly persistence: 'local' | 'session' | 'memory';
  recordRecent(path: NavigationPath): void;
  toggleFavorite(path: NavigationPath): void;
  isFavorite(path: NavigationPath): boolean;
  removeSecretPaths(mount: string, paths: readonly string[]): void;
  clearLocalNavigationData(): void;
}

export const NavigationHistoryContext =
  createContext<NavigationHistoryContextValue | null>(null);

export function useNavigationHistory(): NavigationHistoryContextValue {
  const context = useContext(NavigationHistoryContext);
  if (!context) {
    throw new Error('useNavigationHistory must be used inside NavigationHistoryProvider');
  }
  return context;
}
