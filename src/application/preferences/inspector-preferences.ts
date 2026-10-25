import { INSPECTOR_PREFERENCES_STORAGE_KEY } from '@/application/storage/browser-storage-keys';

export type InspectorDockPlacement = 'bottom' | 'right';

export interface InspectorPreferences {
  readonly placement: InspectorDockPlacement;
  readonly bottomRatio: number;
  readonly rightWidth: number;
}

export const DEFAULT_INSPECTOR_PREFERENCES: InspectorPreferences = {
  placement: 'bottom',
  bottomRatio: 0.4,
  rightWidth: 380,
};

/** Wide screens have room for a side panel; narrower ones keep the table usable with a bottom dock. */
export const RIGHT_DOCK_MIN_VIEWPORT = 1280;

export function defaultInspectorPreferences(viewportWidth?: number): InspectorPreferences {
  return viewportWidth !== undefined && viewportWidth >= RIGHT_DOCK_MIN_VIEWPORT
    ? { ...DEFAULT_INSPECTOR_PREFERENCES, placement: 'right' }
    : DEFAULT_INSPECTOR_PREFERENCES;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function loadInspectorPreferences(
  storage: Storage | null,
  viewportWidth?: number,
): InspectorPreferences {
  const fallback = defaultInspectorPreferences(viewportWidth);
  if (!storage) return fallback;
  try {
    const parsed = JSON.parse(
      storage.getItem(INSPECTOR_PREFERENCES_STORAGE_KEY) ?? 'null',
    ) as Record<string, unknown> | null;
    if (!parsed) return fallback;
    return {
      placement: parsed.placement === 'right' ? 'right' : 'bottom',
      bottomRatio: typeof parsed.bottomRatio === 'number'
        ? clamp(parsed.bottomRatio, 0.2, 0.75)
        : DEFAULT_INSPECTOR_PREFERENCES.bottomRatio,
      rightWidth: typeof parsed.rightWidth === 'number'
        ? clamp(parsed.rightWidth, 280, 720)
        : DEFAULT_INSPECTOR_PREFERENCES.rightWidth,
    };
  } catch {
    return fallback;
  }
}

export function saveInspectorPreferences(
  storage: Storage | null,
  preferences: InspectorPreferences,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(INSPECTOR_PREFERENCES_STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
