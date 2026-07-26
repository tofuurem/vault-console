import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import type { KvV2Secret } from '@/domain/vault/contracts';
import VersionComparison from './VersionComparison';

function secret(version: number, data: Readonly<Record<string, unknown>>): KvV2Secret {
  return {
    mount: 'applications',
    path: 'platform/api',
    data,
    metadata: {
      createdTime: `2026-07-2${version}T10:00:00Z`,
      version,
      customMetadata: {},
      destroyed: false,
    },
  };
}

describe('VersionComparison', () => {
  it('keeps comparison controls usable on narrow screens and restores as a new version', async () => {
    const user = userEvent.setup();
    const previous = secret(1, { token: 'old-token', enabled: false });
    const current = secret(2, { token: 'new-token', enabled: true });
    const loadVersion = vi.fn(async () => previous);
    const onRestore = vi.fn(async () => undefined);

    render(
      <VersionComparison
        open
        onClose={vi.fn()}
        mount="applications"
        path="platform/api"
        history={{
          currentVersion: 2,
          oldestVersion: 1,
          customMetadata: {},
          versions: [
            { version: 2, createdTime: '2026-07-22T10:00:00Z', destroyed: false },
            { version: 1, createdTime: '2026-07-21T10:00:00Z', destroyed: false },
          ],
        }}
        currentSecret={current}
        loadVersion={loadVersion}
        onRestore={onRestore}
      />,
    );

    expect(screen.getByRole('combobox', { name: 'Version A' }))
      .toHaveClass('h-11', 'sm:h-8');
    expect(screen.getByRole('combobox', { name: 'Version B' }))
      .toHaveClass('h-11', 'sm:h-8');

    await screen.findAllByRole('button', {
      name: 'Reveal comparison value',
    });
    const tokenRow = screen.getByText('token').parentElement;
    expect(tokenRow).not.toBeNull();
    const reveal = within(tokenRow as HTMLElement).getAllByRole('button', {
      name: 'Reveal comparison value',
    })[0];
    expect(reveal).toHaveClass('h-11', 'w-11', 'opacity-100');
    await user.click(reveal);
    expect(screen.getByText('old-token')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Restore v2' }));
    await waitFor(() => expect(onRestore).toHaveBeenCalledWith(2, current.data));
  });
});
