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

const STORAGE_KEY = 'vault-console:inspector-layout:v1';

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(Math.max(value, minimum), maximum);
}

export function loadInspectorPreferences(storage: Storage | null): InspectorPreferences {
  if (!storage) return DEFAULT_INSPECTOR_PREFERENCES;
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? 'null') as Record<string, unknown> | null;
    if (!parsed) return DEFAULT_INSPECTOR_PREFERENCES;
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
    return DEFAULT_INSPECTOR_PREFERENCES;
  }
}

export function saveInspectorPreferences(
  storage: Storage | null,
  preferences: InspectorPreferences,
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(preferences));
    return true;
  } catch {
    return false;
  }
}
