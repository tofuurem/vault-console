import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useTheme } from './ThemeContext';
import { ThemeProvider } from './ThemeProvider';
import type { ThemeStorage } from './theme';

class MatchMediaStub {
  matches: boolean;
  readonly media = '(prefers-color-scheme: dark)';
  readonly onchange = null;
  readonly addListener = vi.fn();
  readonly removeListener = vi.fn();
  readonly dispatchEvent = vi.fn(() => true);
  readonly addEventListener = vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => {
    this.listener = listener;
  });
  readonly removeEventListener = vi.fn();
  private listener?: (event: MediaQueryListEvent) => void;

  constructor(matches: boolean) {
    this.matches = matches;
  }

  change(matches: boolean) {
    this.matches = matches;
    this.listener?.({ matches, media: this.media } as MediaQueryListEvent);
  }
}

function ThemeHarness() {
  const theme = useTheme();
  return (
    <>
      <output>{theme.preference}:{theme.resolvedTheme}</output>
      <button type="button" onClick={() => theme.setPreference('system')}>System</button>
      <button type="button" onClick={() => theme.setPreference('light')}>Light</button>
      <button type="button" onClick={() => theme.setPreference('dark')}>Dark</button>
    </>
  );
}

afterEach(() => {
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.style.colorScheme = '';
});

describe('ThemeProvider', () => {
  it('follows system changes only while the system preference is active', async () => {
    const user = userEvent.setup();
    const media = new MatchMediaStub(false);
    const storage: ThemeStorage = {
      getItem: () => null,
      setItem: vi.fn(),
    };

    render(
      <ThemeProvider storage={storage} colorSchemeQuery={media}>
        <ThemeHarness />
      </ThemeProvider>,
    );

    expect(screen.getByText('system:light')).toBeVisible();
    expect(document.documentElement).toHaveAttribute('data-theme', 'light');

    act(() => media.change(true));
    expect(screen.getByText('system:dark')).toBeVisible();
    expect(document.documentElement.style.colorScheme).toBe('dark');

    await user.click(screen.getByRole('button', { name: 'Light' }));
    expect(screen.getByText('light:light')).toBeVisible();

    act(() => media.change(false));
    act(() => media.change(true));
    expect(screen.getByText('light:light')).toBeVisible();
  });

  it('restores an explicit preference and keeps rendering with blocked storage', () => {
    const media = new MatchMediaStub(false);
    render(
      <ThemeProvider
        storage={{
          getItem: () => {
            throw new DOMException('blocked');
          },
          setItem: () => {
            throw new DOMException('blocked');
          },
        }}
        colorSchemeQuery={media}
      >
        <ThemeHarness />
      </ThemeProvider>,
    );

    expect(screen.getByText('system:light')).toBeVisible();
  });
});
