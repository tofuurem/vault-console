import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import { useWorkspacePreferences } from './WorkspacePreferencesContext';
import { WorkspacePreferencesProvider } from './WorkspacePreferencesProvider';
import {
  WORKSPACE_PREFERENCES_STORAGE_KEY,
  type WorkspacePreferencesStorage,
} from './workspace-preferences';

function Harness() {
  const preferences = useWorkspacePreferences();
  return (
    <>
      <output>
        {preferences.density}:{preferences.persistenceAvailable ? 'saved' : 'memory'}
      </output>
      <button type="button" onClick={() => preferences.setDensity('compact')}>
        Compact
      </button>
    </>
  );
}

describe('WorkspacePreferencesProvider', () => {
  it('restores and persists a versioned density preference', async () => {
    const user = userEvent.setup();
    const values = new Map<string, string>([[
      WORKSPACE_PREFERENCES_STORAGE_KEY,
      JSON.stringify({ version: 1, density: 'compact' }),
    ]]);
    const storage: WorkspacePreferencesStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };
    render(
      <WorkspacePreferencesProvider storage={storage}>
        <Harness />
      </WorkspacePreferencesProvider>,
    );

    expect(screen.getByText('compact:saved')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Compact' }));
    expect(JSON.parse(values.get(WORKSPACE_PREFERENCES_STORAGE_KEY)!))
      .toEqual({ version: 1, density: 'compact' });
  });

  it('falls back to comfortable and keeps changes in memory when storage fails', async () => {
    const user = userEvent.setup();
    const blocked = vi.fn(() => {
      throw new DOMException('blocked');
    });
    render(
      <WorkspacePreferencesProvider storage={{
        getItem: blocked,
        setItem: blocked,
      }}>
        <Harness />
      </WorkspacePreferencesProvider>,
    );

    expect(screen.getByText('comfortable:memory')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Compact' }));
    expect(screen.getByText('compact:memory')).toBeVisible();
  });
});
