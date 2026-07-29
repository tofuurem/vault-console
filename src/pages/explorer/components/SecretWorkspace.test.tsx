import { render, screen, waitFor } from '@testing-library/react';
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

async function replaceEditorContent(
  user: ReturnType<typeof userEvent.setup>,
  value: string,
) {
  const editor = await screen.findByLabelText('Secret JSON editor');
  await user.click(editor);
  await user.keyboard('{Control>}a{/Control}');
  await user.paste(value);
  return editor;
}

describe('SecretWorkspace', () => {
  it('reads nested data as a masked tree or redacted JSON', async () => {
    const user = userEvent.setup();
    renderWorkspace();

    expect(screen.getByRole('dialog', { name: 'applications/platform/runtime' })).toBeVisible();
    expect(screen.queryByText('alpha-value')).not.toBeInTheDocument();
    expect(screen.getAllByText('••••••••').length).toBeGreaterThan(0);

    const revealAccess = screen.getByRole('button', {
      name: 'Reveal service/credentials/access',
    });
    expect(revealAccess).toBeVisible();
    expect(revealAccess).toHaveAttribute('aria-pressed', 'false');
    await user.click(revealAccess);
    expect(screen.getByText('alpha-value')).toBeVisible();
    expect(screen.getByRole('button', {
      name: 'Reveal service/ports/[0]',
    })).toHaveAttribute('aria-pressed', 'false');

    const treeTab = screen.getByRole('tab', { name: 'Tree' });
    treeTab.focus();
    await user.keyboard('{ArrowRight}');
    expect(screen.getByRole('tab', { name: 'JSON' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByText(/"access": "••••••••"/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Reveal values' }));
    expect(screen.getByText(/"access": "alpha-value"/)).toBeVisible();
  });

  it('masks individually revealed tree data when the secret changes', async () => {
    const user = userEvent.setup();
    const props: ComponentProps<typeof SecretWorkspace> = {
      open: true,
      initialMode: 'view',
      secret,
      canEdit: false,
      onClose: vi.fn(),
      onSave: vi.fn(async () => undefined),
    };
    const view = render(<SecretWorkspace {...props} />);

    await user.click(screen.getByRole('button', {
      name: 'Reveal service/credentials/access',
    }));
    expect(screen.getByText('alpha-value')).toBeVisible();

    view.rerender(
      <SecretWorkspace
        {...props}
        secret={{
          ...secret,
          data: {
            service: {
              credentials: { access: 'beta-value' },
              ports: [443],
              enabled: false,
            },
          },
          metadata: { ...secret.metadata, version: 12 },
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.queryByText('beta-value')).not.toBeInTheDocument();
      expect(screen.getByRole('button', {
        name: 'Reveal service/credentials/access',
      })).toHaveAttribute('aria-pressed', 'false');
    });
  });

  it('saves a nested object from the full-height editor', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    const onClose = vi.fn();
    renderWorkspace({ initialMode: 'edit', onSave, onClose });
    const nextData = {
      service: {
        credentials: { access: 'rotated-value' },
        ports: [443, 9443],
        enabled: false,
      },
      region: 'local',
    };

    await replaceEditorContent(user, JSON.stringify(nextData));
    await user.click(screen.getByRole('button', { name: 'Save version 12' }));

    await waitFor(() => expect(onSave).toHaveBeenCalledWith(nextData));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('blocks invalid JSON and protects dirty edits from accidental close', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderWorkspace({ initialMode: 'edit', onClose });

    const editor = await replaceEditorContent(user, '{\n  "service":,\n}');
    expect(editor).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('JSON syntax error at line 2, column 13: unexpected comma or missing value.');
    expect(screen.getByRole('button', { name: 'Go to line 2, column 13' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Save version 12' }));
    await waitFor(() => expect(screen.getByText('Ln 2, Col 13')).toBeVisible());

    await user.click(screen.getByRole('button', { name: 'Close secret workspace' }));
    expect(confirm).toHaveBeenCalledWith('Discard unsaved secret changes?');
    expect(onClose).not.toHaveBeenCalled();

    confirm.mockReturnValue(true);
    await user.click(screen.getByRole('button', { name: 'Close secret workspace' }));
    expect(onClose).toHaveBeenCalledOnce();
  });
});
