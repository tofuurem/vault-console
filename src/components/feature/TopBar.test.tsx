import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { THEME_STORAGE_KEY, type ThemeStorage } from '@/application/theme/theme';
import { ThemeProvider } from '@/application/theme/ThemeProvider';
import { vaultToken } from '@/domain/vault/sensitive-value';
import TopBar from './TopBar';

const lightQuery = {
  matches: false,
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
};

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
});

describe('TopBar', () => {
  it('changes and persists the appearance from the session menu', async () => {
    const user = userEvent.setup();
    const values = new Map<string, string>();
    const storage: ThemeStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };

    render(
      <ThemeProvider storage={storage} colorSchemeQuery={lightQuery}>
        <TopBar
          session={{
            serverUrl: 'https://vault.example.test',
            token: vaultToken('hvs.test'),
            authMethod: 'token',
            displayName: 'Alice',
          }}
          health={{ initialized: true, sealed: false, standby: false }}
          onSignOut={vi.fn()}
        />
      </ThemeProvider>,
    );

    await user.click(screen.getByRole('button', { name: 'Session menu for Alice' }));
    await user.click(screen.getByRole('radio', { name: 'Dark' }));

    expect(screen.getByRole('radio', { name: 'Dark' })).toHaveAttribute('aria-checked', 'true');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(values.get(THEME_STORAGE_KEY)).toBe('dark');
  });

  it('keeps health meaning available as text in the session surface', async () => {
    const user = userEvent.setup();

    render(
      <ThemeProvider storage={null} colorSchemeQuery={lightQuery}>
        <TopBar
          session={{
            serverUrl: 'https://vault.example.test',
            token: vaultToken('hvs.test'),
            authMethod: 'token',
            displayName: 'Alice',
          }}
          health={{ initialized: true, sealed: true, standby: false }}
          onSignOut={vi.fn()}
        />
      </ThemeProvider>,
    );

    expect(screen.getByText('Vault sealed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Session menu for Alice' }));
    expect(screen.getByText(/choice applies only until/i)).toBeVisible();
  });
});
