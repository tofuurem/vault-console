import { createContext, useContext } from 'react';

import type { WorkspaceDensity } from './workspace-preferences';

export interface WorkspacePreferencesContextValue {
  readonly density: WorkspaceDensity;
  readonly persistenceAvailable: boolean;
  setDensity(density: WorkspaceDensity): void;
}

export const WorkspacePreferencesContext =
  createContext<WorkspacePreferencesContextValue | null>(null);

export function useWorkspacePreferences(): WorkspacePreferencesContextValue {
  const context = useContext(WorkspacePreferencesContext);
  if (!context) {
    throw new Error(
      'useWorkspacePreferences must be used inside WorkspacePreferencesProvider',
    );
  }
  return context;
}
