import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps } from 'react';
import { describe, expect, it, vi } from 'vitest';

import type { KvV2Secret } from '@/domain/vault/contracts';
import { LARGE_SECRET_JSON_BYTES } from '@/application/json/secret-json-validation';
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
  const jsonView = screen.queryByRole('radio', { name: 'JSON' });
  if (jsonView && jsonView.getAttribute('aria-checked') !== 'true') await user.click(jsonView);
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
    renderWorkspace({ initialMode: 'edit', onClose });

    const editor = await replaceEditorContent(user, '{\n  "service":,\n}');
    await user.click(screen.getByRole('button', { name: 'Save version 12' }));
    expect(editor).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByRole('alert')).toHaveTextContent('JSON syntax error at line 2, column 13: unexpected comma or missing value.');
    expect(screen.getByRole('button', { name: 'Go to line 2, column 13' })).toBeVisible();
    await waitFor(() => expect(screen.getByText('Ln 2, Col 13')).toBeVisible());

    await user.click(screen.getByRole('button', { name: 'Close secret workspace' }));
    const prompt = await screen.findByRole('dialog', { name: 'Discard unsaved changes?' });
    await user.click(within(prompt).getByRole('button', { name: 'Keep editing' }));
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Close secret workspace' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Discard unsaved changes?' })).getByRole('button', { name: 'Discard changes' }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it('uses a plain editor for large JSON and revalidates the exact content before save', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    const largeSecret: KvV2Secret = {
      ...secret,
      data: { payload: 'x'.repeat(LARGE_SECRET_JSON_BYTES) },
    };
    renderWorkspace({ initialMode: 'edit', secret: largeSecret, onSave });

    await user.click(screen.getByRole('radio', { name: 'JSON' }));
    const editor = await screen.findByLabelText('Secret JSON editor');
    expect(editor.tagName).toBe('TEXTAREA');
    expect(screen.getByText(/Large JSON document/)).toBeVisible();

    fireEvent.change(editor, {
      target: { value: `{"payload":"${'x'.repeat(LARGE_SECRET_JSON_BYTES)}","broken":}` },
    });
    await user.click(screen.getByRole('button', { name: 'Save version 12' }));

    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('JSON syntax error');
    expect(screen.getByText(/Large JSON document/)).toBeVisible();
  });

  it('edits a flat secret as key/value fields and keeps JSON as an alternative', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderWorkspace({
      initialMode: 'edit',
      secret: { ...secret, data: { USERNAME: 'svc', PASSWORD: 'old' } },
      onSave,
    });

    expect(screen.getByRole('radio', { name: 'Fields' })).toHaveAttribute('aria-checked', 'true');
    const password = screen.getByLabelText('Value for PASSWORD');
    await user.clear(password);
    await user.type(password, 'rotated');
    await user.click(screen.getByRole('button', { name: 'Add field' }));
    const keys = screen.getAllByLabelText('Secret key');
    await user.type(keys[keys.length - 1], 'HOST');
    await user.type(screen.getByLabelText('Value for HOST'), 'db.internal');

    await user.click(screen.getByRole('radio', { name: 'JSON' }));
    expect(screen.getByLabelText('Secret JSON editor')).toBeInTheDocument();
    await user.click(screen.getByRole('radio', { name: 'Fields' }));

    await user.click(screen.getByRole('button', { name: 'Save version 12' }));
    expect(onSave).toHaveBeenCalledWith({ USERNAME: 'svc', PASSWORD: 'rotated', HOST: 'db.internal' });
  });

  it('blocks saving duplicate field keys and keeps nested secrets in JSON', async () => {
    const user = userEvent.setup();
    const onSave = vi.fn(async () => undefined);
    renderWorkspace({
      initialMode: 'edit',
      secret: { ...secret, data: { A: '1' } },
      onSave,
    });
    await user.click(screen.getByRole('button', { name: 'Add field' }));
    const keys = screen.getAllByLabelText('Secret key');
    await user.type(keys[1], 'A');
    await user.click(screen.getByRole('button', { name: 'Save version 12' }));
    expect(onSave).not.toHaveBeenCalled();
    expect(screen.getByRole('alert')).toHaveTextContent('Secret keys must be unique.');
    cleanup();

    renderWorkspace({ initialMode: 'edit', secret, onSave });
    expect(screen.getByRole('radio', { name: 'JSON' })).toHaveAttribute('aria-checked', 'true');
    await user.click(screen.getByRole('radio', { name: 'Fields' }));
    expect(screen.getByText(/can only be edited as JSON/)).toHaveAttribute('role', 'status');
  });
});
