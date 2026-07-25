import { describe, expect, it } from 'vitest';

import { isEditableShortcutTarget, isPaletteShortcut } from './shortcut';

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
});
