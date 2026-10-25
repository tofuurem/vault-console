import { describe, expect, it } from 'vitest';

import {
  isApplePlatform,
  keyboardShortcutGroups,
  paletteShortcutKeys,
  spokenKeyName,
} from './keyboard-shortcuts';

describe('keyboard shortcut catalogue', () => {
  it('detects Apple platforms for the palette key label', () => {
    expect(isApplePlatform({ platform: 'MacIntel', userAgent: '' })).toBe(true);
    expect(isApplePlatform({ platform: '', userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)' })).toBe(true);
    expect(isApplePlatform({ platform: 'Win32', userAgent: 'Windows NT 10.0' })).toBe(false);
    expect(paletteShortcutKeys(true)).toEqual(['⌘', 'K']);
    expect(paletteShortcutKeys(false)).toEqual(['Ctrl', 'K']);
  });

  it('lists every supported shortcut once per group', () => {
    const groups = keyboardShortcutGroups(false);
    const ids = groups.flatMap((group) => group.shortcuts.map((shortcut) => shortcut.id));
    expect(ids).toEqual(expect.arrayContaining(['palette', 'help', 'search', 'rows', 'open', 'edit']));
    expect(new Set(ids).size).toBe(ids.length);
    const palette = groups[0].shortcuts.find((shortcut) => shortcut.id === 'palette');
    expect(palette).toMatchObject({ keys: ['Ctrl', 'K'], combination: true });
  });

  it('spells out symbol keys for screen readers', () => {
    expect(spokenKeyName('↑')).toBe('Up arrow');
    expect(spokenKeyName('?')).toBe('Question mark');
    expect(spokenKeyName('Enter')).toBe('Enter');
  });
});
