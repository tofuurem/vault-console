import { describe, expect, it } from 'vitest';

import {
  isEditableShortcutTarget,
  isPaletteShortcut,
  rankShortcutCommands,
  type ShortcutCommand,
} from './shortcut';

describe('shortcut matching', () => {
  it('recognizes Command-K and Control-K without accepting modified variants', () => {
    expect(isPaletteShortcut({ key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false })).toBe(true);
    expect(isPaletteShortcut({ key: 'K', metaKey: false, ctrlKey: true, altKey: false, shiftKey: false })).toBe(true);
    expect(isPaletteShortcut({ key: 'k', metaKey: false, ctrlKey: false, altKey: false, shiftKey: false })).toBe(false);
    expect(isPaletteShortcut({ key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true })).toBe(false);
  });

  it('recognizes editable controls and contenteditable descendants', () => {
    const input = document.createElement('input');
    const editor = document.createElement('div');
    const child = document.createElement('span');
    editor.setAttribute('contenteditable', 'true');
    editor.append(child);

    expect(isEditableShortcutTarget(input)).toBe(true);
    expect(isEditableShortcutTarget(child)).toBe(true);
    expect(isEditableShortcutTarget(document.createElement('button'))).toBe(false);
  });

  it('uses recent and favorite boosts only to break equal search matches', () => {
    const command = (
      id: string,
      label: string,
      searchTieBreaker: number,
    ): ShortcutCommand => ({
      id,
      label,
      group: 'Paths',
      searchTieBreaker,
      run: () => undefined,
    });
    const commands = [
      command('weaker-favorite', 'Open team database', 2),
      command('recent', 'database recent', 1),
      command('favorite', 'database favorite', 2),
      command('exact', 'database', 0),
    ];

    expect(rankShortcutCommands(commands, 'database').map(({ id }) => id)).toEqual([
      'exact',
      'favorite',
      'recent',
      'weaker-favorite',
    ]);
  });

  it('matches commands when all query terms appear in different parts of the search text', () => {
    const commands: readonly ShortcutCommand[] = [
      {
        id: 'compact',
        label: 'Use compact table density',
        group: 'View',
        keywords: ['density', 'table', 'rows', 'spacing', 'compact'],
        run: () => undefined,
      },
      {
        id: 'dark',
        label: 'Use dark appearance',
        group: 'Appearance',
        keywords: ['theme', 'color', 'dark'],
        run: () => undefined,
      },
    ];

    expect(rankShortcutCommands(commands, 'compact density').map(({ id }) => id))
      .toEqual(['compact']);
    expect(rankShortcutCommands(commands, 'density missing')).toEqual([]);
  });
});
