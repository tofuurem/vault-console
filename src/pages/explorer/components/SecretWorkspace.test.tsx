import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { KvV2Secret } from '@/domain/vault/contracts';
import SecretWorkspace from './SecretWorkspace';

const secret: KvV2Secret = {
  mount: 'applications',
  path: 'platform/runtime',
  data: {
    service: {
      credentials: { access: 'alpha-value' },
      ports: [443, 8443],
      enabled: true,
    },
  },
  metadata: {
    createdTime: '2026-07-23T01:00:00Z',
    version: 11,
    customMetadata: {},
    destroyed: false,
  },
};

function renderWorkspace(overrides: Partial<ComponentProps<typeof SecretWorkspace>> = {}) {
  const props: ComponentProps<typeof SecretWorkspace> = {
    open: true,
    initialMode: 'view',
    secret,
    canEdit: true,
    onClose: vi.fn(),
    onSave: vi.fn(async () => undefined),
    ...overrides,
  };
  render(<SecretWorkspace {...props} />);
  return props;
}

describe('SecretWorkspace', () => {
  it('reads nested data as a masked tree or redacted JSON', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    expect(screen.getByRole('dialog', { name: 'applications/platform/runtime' })).toBeVisible();
    expect(screen.queryByText('alpha-value')).not.toBeInTheDocument();
    expect(screen.getAllByText('••••••••').length).toBeGreaterThan(0);

    const treeTab = screen.getByRole('tab', { name: 'Tree' });
    treeTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/"access": "••••••••"/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Reveal values' }));
    expect(screen.getByText(/"access": "alpha-value"/)).toBeVisible();
  });

  it('saves a nested object from the full-height editor', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();
    renderWorkspace({ initialMode: 'edit', onSave, onClose });
    const editor = screen.getByLabelText('Secret JSON editor');
    const nextData = {
      service: {
        credentials: { access: 'rotated-value' },
        ports: [443, 9443],
        enabled: false,
      },
      region: 'local',
    };

    fireEvent.change(editor, { target: { value: JSON.stringify(nextData) } });
    await user.click(screen.getByRole('button', { name: 'Save version 12' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(nextData));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('blocks invalid JSON and protects dirty edits from accidental close', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWorkspace({ initialMode: 'edit', onClose });
    const editor = screen.getByLabelText('Secret JSON editor');

    fireEvent.change(editor, { target: { value: '{"service":' } });
    expect(editor).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('button', { name: 'Save version 12' })).toBeDisabled();

    await user.click(screen.getByRole('button', { name: 'Close secret workspace' }));
    expect(confirm).toHaveBeenCalledWith('Discard unsaved secret changes?');
    expect(onClose).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Close secret workspace' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
