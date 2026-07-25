import { describe, expect, it } from 'vitest';

import {
  emptySecretSelection,
  hiddenSelectionCount,
  selectionForScope,
  toggleAllVisibleSecrets,
  updateSecretSelection,
} from './selection';

describe('scoped secret selection', () => {
  it('selects a visible range while preserving hidden selections', () => {
    let selection = updateSecretSelection({
      selection: emptySecretSelection('applications:'),
      scope: 'applications:',
      visibleSecretPaths: ['a', 'b', 'c', 'd'],
      path: 'b',
      checked: true,
      range: false,
    });
    selection = {
      ...selection,
      paths: [...selection.paths, 'hidden'],
    };
    selection = updateSecretSelection({
      selection,
      scope: 'applications:',
      visibleSecretPaths: ['a', 'b', 'c', 'd'],
      path: 'd',
      checked: true,
      range: true,
    });

    expect(selection.paths).toEqual(['b', 'hidden', 'c', 'd']);
    expect(hiddenSelectionCount(selection.paths, ['b', 'c', 'd'])).toBe(1);
  });

  it('toggles only visible secrets and resets on navigation scope change', () => {
    const selected = toggleAllVisibleSecrets({
      selection: {
        scope: 'applications:',
        paths: ['hidden'],
      },
      scope: 'applications:',
      visibleSecretPaths: ['one', 'two'],
    });
    expect(selected.paths).toEqual(['hidden', 'one', 'two']);
    expect(toggleAllVisibleSecrets({
      selection: selected,
      scope: 'applications:',
      visibleSecretPaths: ['one', 'two'],
    }).paths).toEqual(['hidden']);
    expect(selectionForScope(selected, 'applications:other/')).toEqual({
      scope: 'applications:other/',
      paths: [],
    });
  });

  it('ignores paths that are not visible secret rows', () => {
    const selection = emptySecretSelection('applications:');
    expect(updateSecretSelection({
      selection,
      scope: 'applications:',
      visibleSecretPaths: ['secret'],
      path: 'folder/',
      checked: true,
      range: false,
    })).toBe(selection);
  });
});
