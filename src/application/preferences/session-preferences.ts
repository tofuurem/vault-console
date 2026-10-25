import { useCallback, useState } from 'react';

import { SESSION_PREFERENCES_STORAGE_KEY } from '@/application/storage/browser-storage-keys';

export interface SessionPreferences {
  /** Renew a renewable token automatically when its expiry warning starts. */
  readonly autoRenew: boolean;
}

export const DEFAULT_SESSION_PREFERENCES: SessionPreferences = { autoRenew: false };

function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadSessionPreferences(storage: Storage | null): SessionPreferences {
  if (!storage) return DEFAULT_SESSION_PREFERENCES;
  try {
    const parsed = JSON.parse(storage.getItem(SESSION_PREFERENCES_STORAGE_KEY) ?? 'null') as
      | Record<string, unknown>
      | null;
    return { autoRenew: parsed?.autoRenew === true };
  } catch {
    return DEFAULT_SESSION_PREFERENCES;
  }
}

export function saveSessionPreferences(storage: Storage | null, preferences: SessionPreferences): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SESSION_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}

export function useSessionPreferences() {
  const [preferences, setPreferences] = useState(() => loadSessionPreferences(browserStorage()));
  const update = useCallback((next: SessionPreferences) => {
    setPreferences(next);
    saveSessionPreferences(browserStorage(), next);
  }, []);
  return [preferences, update] as const;
}
