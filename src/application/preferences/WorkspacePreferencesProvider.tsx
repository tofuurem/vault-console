import {
  useCallback,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import {
  readWorkspacePreferences,
  writeWorkspacePreferences,
  type WorkspaceDensity,
  type WorkspacePreferencesStorage,
} from './workspace-preferences';
import {
  WorkspacePreferencesContext,
  type WorkspacePreferencesContextValue,
} from './WorkspacePreferencesContext';

interface WorkspacePreferencesProviderProps {
  readonly children: ReactNode;
  readonly storage?: WorkspacePreferencesStorage | null;
}

function browserLocalStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function WorkspacePreferencesProvider({
  children,
  storage: suppliedStorage,
}: WorkspacePreferencesProviderProps) {
  const [storage] = useState(
    () => suppliedStorage === undefined ? browserLocalStorage() : suppliedStorage,
  );
  const [initial] = useState(() => readWorkspacePreferences(storage));
  const [density, setDensityState] = useState(initial.density);
  const [persistenceAvailable, setPersistenceAvailable] = useState(
    initial.persistenceAvailable,
  );
  const setDensity = useCallback((nextDensity: WorkspaceDensity) => {
    setDensityState(nextDensity);
    setPersistenceAvailable(writeWorkspacePreferences(storage, nextDensity));
  }, [storage]);
  const value = useMemo<WorkspacePreferencesContextValue>(() => ({
    density,
    persistenceAvailable,
    setDensity,
  }), [density, persistenceAvailable, setDensity]);

  return (
    <WorkspacePreferencesContext.Provider value={value}>
      {children}
    </WorkspacePreferencesContext.Provider>
  );
}
