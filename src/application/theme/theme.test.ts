import { describe, expect, it } from 'vitest';

import {
  THEME_STORAGE_KEY,
  readThemePreference,
  resolveTheme,
  writeThemePreference,
} from './theme';

describe('theme preferences', () => {
  it('accepts only supported persisted preferences', () => {
    expect(readThemePreference({ getItem: () => 'dark' })).toBe('dark');
    expect(readThemePreference({ getItem: () => 'light' })).toBe('light');
    expect(readThemePreference({ getItem: () => 'system' })).toBe('system');
    expect(readThemePreference({ getItem: () => 'sepia' })).toBe('system');
  });

  it('falls back safely when storage is unavailable', () => {
    expect(readThemePreference({
      getItem: () => {
        throw new DOMException('blocked');
      },
    })).toBe('system');
  });

  it('resolves system preference from the current color scheme', () => {
    expect(resolveTheme('system', true)).toBe('dark');
    expect(resolveTheme('system', false)).toBe('light');
    expect(resolveTheme('dark', false)).toBe('dark');
    expect(resolveTheme('light', true)).toBe('light');
  });

  it('persists only the preference and tolerates write failures', () => {
    const values = new Map<string, string>();
    expect(writeThemePreference({
      setItem: (key, value) => values.set(key, value),
    }, 'dark')).toBe(true);
    expect(values.get(THEME_STORAGE_KEY)).toBe('dark');

    expect(writeThemePreference({
      setItem: () => {
        throw new DOMException('blocked');
      },
    }, 'light')).toBe(false);
  });
});
