import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { VaultSessionProvider } from '@/application/vault/VaultSessionProvider';
import ApplicationErrorBoundary from './ApplicationErrorBoundary';

describe('ApplicationErrorBoundary', () => {
  it('recovers a render failure and copies only redacted diagnostics', async () => {
    const user = userEvent.setup();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    let shouldCrash = true;
    const secret = 'production/database/do-not-leak';

    function UnstableScreen() {
      if (shouldCrash) throw new Error(secret);
      return <h1>Recovered screen</h1>;
    }

    render(
      <VaultSessionProvider storage={null}>
        <MemoryRouter initialEntries={[`/explorer/${secret}`]}>
          <ApplicationErrorBoundary>
            <UnstableScreen />
          </ApplicationErrorBoundary>
        </MemoryRouter>
      </VaultSessionProvider>,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('This screen stopped unexpectedly');
    expect(screen.getByText(/render-failure · \/explorer\/:mount\/\*/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Retry screen' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Return to Explorer' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Sign out' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Copy safe diagnostics' }));
    const copied = await navigator.clipboard.readText();
    expect(copied).toContain('"route": "/explorer/:mount/*"');
    expect(copied).not.toContain(secret);

    shouldCrash = false;
    await user.click(screen.getByRole('button', { name: 'Retry screen' }));
    expect(screen.getByRole('heading', { name: 'Recovered screen' })).toBeVisible();
  });
});
