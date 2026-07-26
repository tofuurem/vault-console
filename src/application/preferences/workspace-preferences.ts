export const WORKSPACE_PREFERENCES_STORAGE_KEY =
  'vault-console:workspace-preferences:v1';

export const WORKSPACE_DENSITIES = ['comfortable', 'compact'] as const;

export type WorkspaceDensity = (typeof WORKSPACE_DENSITIES)[number];

export interface WorkspacePreferencesStorage {
  getItem?(key: string): string | null;
  setItem?(key: string, value: string): void;
}

export interface WorkspacePreferencesSnapshot {
  readonly density: WorkspaceDensity;
  readonly persistenceAvailable: boolean;
}

interface StoredWorkspacePreferences {
  readonly version: 1;
  readonly density: WorkspaceDensity;
}

function isWorkspaceDensity(value: unknown): value is WorkspaceDensity {
  return typeof value === 'string'
    && WORKSPACE_DENSITIES.includes(value as WorkspaceDensity);
}

export function readWorkspacePreferences(
  storage: WorkspacePreferencesStorage | null,
): WorkspacePreferencesSnapshot {
  if (!storage) {
    return { density: 'comfortable', persistenceAvailable: false };
  }
  try {
    const raw = storage.getItem?.(WORKSPACE_PREFERENCES_STORAGE_KEY);
    if (!raw) return { density: 'comfortable', persistenceAvailable: true };
    const parsed = JSON.parse(raw) as Partial<StoredWorkspacePreferences>;
    return {
      density: parsed.version === 1 && isWorkspaceDensity(parsed.density)
        ? parsed.density
        : 'comfortable',
      persistenceAvailable: true,
    };
  } catch {
    return { density: 'comfortable', persistenceAvailable: false };
  }
}

export function writeWorkspacePreferences(
  storage: WorkspacePreferencesStorage | null,
  density: WorkspaceDensity,
): boolean {
  if (!storage) return false;
  const record: StoredWorkspacePreferences = { version: 1, density };
  try {
    storage.setItem?.(
      WORKSPACE_PREFERENCES_STORAGE_KEY,
      JSON.stringify(record),
    );
    return true;
  } catch {
    return false;
  }
}
