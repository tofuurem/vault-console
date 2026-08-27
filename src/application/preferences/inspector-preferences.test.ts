import { describe, expect, it } from 'vitest';

import { INSPECTOR_PREFERENCES_STORAGE_KEY } from '@/application/storage/browser-storage-keys';

import {
  DEFAULT_INSPECTOR_PREFERENCES,
  loadInspectorPreferences,
  saveInspectorPreferences,
} from './inspector-preferences';

describe('inspector preferences', () => {
  it('stores layout only and restores bounded sizes', () => {
    const storage = window.localStorage;
    storage.clear();
    expect(saveInspectorPreferences(storage, {
      placement: 'right',
      bottomRatio: 0.55,
      rightWidth: 460,
    })).toBe(true);

    expect(loadInspectorPreferences(storage)).toEqual({
      placement: 'right',
      bottomRatio: 0.55,
      rightWidth: 460,
    });
    expect(storage.getItem(INSPECTOR_PREFERENCES_STORAGE_KEY)).not.toContain('secret');
  });

  it('falls back safely for malformed or unavailable storage', () => {
    window.localStorage.setItem(INSPECTOR_PREFERENCES_STORAGE_KEY, '{');
    expect(loadInspectorPreferences(window.localStorage)).toEqual(DEFAULT_INSPECTOR_PREFERENCES);
    expect(loadInspectorPreferences(null)).toEqual(DEFAULT_INSPECTOR_PREFERENCES);
  });
});
