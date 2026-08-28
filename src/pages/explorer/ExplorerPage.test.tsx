import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import App from '@/App';
import { RECENT_PATHS_STORAGE_KEY } from '@/application/navigation-history/navigation-history';
import type {
  KvV2Gateway,
  UserpassLogin,
  VaultAuthGateway,
  VaultCapabilityMap,
  VaultHealth,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultToken, type VaultToken } from '@/domain/vault/sensitive-value';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.reader'),
  authMethod: 'token',
  displayName: 'reader',
};

function authGateway(options: {
  capabilitiesUnavailable?: boolean;
  metadataRead?: boolean;
  mountAdmin?: boolean;
  mountConfig?: boolean;
  writeOnly?: boolean;
} = {}): VaultAuthGateway {
  return {
    getHealth: vi.fn(async (): Promise<VaultHealth> => ({ initialized: true, sealed: false, standby: false, version: '1.21.0' })),
    validateToken: vi.fn(async (_serverUrl: string, _token: VaultToken) => session),
    loginUserpass: vi.fn(async (_input: UserpassLogin) => session),
    renewSelf: vi.fn(async () => ({ renewable: false })),
    revokeSelf: vi.fn(async () => undefined),
    getCapabilities: vi.fn(async (_session, paths: readonly string[]): Promise<VaultCapabilityMap> => {
      if (options.capabilitiesUnavailable) {
        throw new VaultError('authorization', { status: 403 });
      }
      return Object.fromEntries(paths.map((path) => [
        path,
        path.startsWith('sys/mounts/') && options.mountAdmin
          ? ['create', 'update', 'sudo']
          : path.startsWith('sys/') || path.startsWith('identity/')
          ? ['deny']
          : path === 'applications/config' && options.mountConfig
            ? ['read', 'update']
          : path.includes('/data/')
            ? options.writeOnly
              ? ['create', 'update']
              : ['create', 'read', 'update', 'delete']
            : path.includes('/metadata/')
              ? options.metadataRead === false || options.writeOnly
                ? ['list']
                : ['read', 'list', 'update', 'delete']
              : ['update'],
      ])) as VaultCapabilityMap;
    }),
  };
}

function kvGateway(options: { denied?: boolean } = {}): KvV2Gateway {
  return {
    listMounts: vi.fn(async () => [{ path: 'applications', accessor: 'kv_apps', description: 'Application secrets', version: 2 as const }]),
    createKvV2Mount: vi.fn(async () => undefined),
    listPaths: vi.fn(async () => {
      if (options.denied) throw new VaultError('authorization');
      return ['billing/', 'nested', 'shared'];
    }),
    readSecret: vi.fn(async (_session, mount, path, version) => ({
      mount,
      path,
      data: path === 'nested'
        ? {
            service: {
              credentials: { access: 'nested-memory-value' },
              ports: [443, 8443],
              enabled: true,
            },
          }
        : { API_KEY: version === 1 ? 'old-memory-only-value' : 'memory-only-value' },
      metadata: { createdTime: '2026-07-21T12:00:00Z', version: version ?? 2, customMetadata: {}, destroyed: false },
    })),
    readSecretMetadata: vi.fn(async () => ({
      createdTime: '2026-07-20T12:00:00Z',
      updatedTime: '2026-07-21T12:00:00Z',
      currentVersion: 2,
      oldestVersion: 1,
      maxVersions: 0,
      casRequired: false,
      deleteVersionAfter: '0s',
      customMetadata: {},
      versions: [
        { version: 2, createdTime: '2026-07-21T12:00:00Z', destroyed: false },
        { version: 1, createdTime: '2026-07-20T12:00:00Z', destroyed: false },
      ],
    })),
    writeSecret: vi.fn(async () => 3),
    updateSecretMetadata: vi.fn(async () => undefined),
    readMountConfig: vi.fn(async () => ({
      maxVersions: 0,
      casRequired: false,
      deleteVersionAfter: '0s',
    })),
    updateMountConfig: vi.fn(async () => undefined),
    deleteLatestSecret: vi.fn(async () => undefined),
    deleteVersions: vi.fn(async () => undefined),
    undeleteVersions: vi.fn(async () => undefined),
    destroyVersions: vi.fn(async () => undefined),
    deleteMetadata: vi.fn(async () => undefined),
  };
}

async function login(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('tab', { name: 'Token' }));
  await user.type(screen.getByLabelText('Vault token'), 'hvs.reader');
  await user.click(screen.getByRole('button', { name: 'Sign in' }));
}

async function replaceEditorContent(
  user: ReturnType<typeof userEvent.setup>,
  value: string,
) {
  const editor = await screen.findByLabelText('Secret JSON editor');
  await user.click(editor);
  await user.keyboard('{Control>}a{/Control}');
  await user.paste(value);
}

describe('ExplorerPage', () => {
  it('uses one comfortable table layout without density controls or commands', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={kvGateway()} />);
    await login(user);
    await screen.findByRole('heading', { name: 'Application secrets' });

    expect(await screen.findByRole('table')).not.toHaveAttribute('data-density');
    await user.click(screen.getByRole('button', {
      name: 'Session menu for reader',
    }));
    expect(screen.queryByRole('radiogroup', { name: 'Table density' }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open command palette' }));
    await user.type(
      screen.getByRole('combobox', { name: 'Search commands' }),
      'table density',
    );
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('creates a KV v2 mount, refreshes the sidebar, and opens it without a page reload', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    const mounts = [
      { path: 'applications', accessor: 'kv_apps', description: 'Application secrets', version: 2 as const },
    ];
    gateway.listMounts = vi.fn(async () => mounts);
    gateway.createKvV2Mount = vi.fn(async (_session, mount) => {
      mounts.push({
        path: mount.path,
        accessor: 'kv_platform',
        description: mount.description,
        version: 2,
      });
    });
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway({ mountAdmin: true })} kvV2Gateway={gateway} />);
    await login(user);
    await screen.findByRole('heading', { name: 'Application secrets' });

    await user.click(screen.getByRole('button', { name: 'Create KV v2 mount' }));
    await user.type(screen.getByLabelText('Mount path'), 'team/platform');
    await user.type(screen.getByLabelText('Description'), 'Platform secrets');
    expect(screen.getByText(/POST \/v1\/sys\/mounts\/team\/platform/)).toBeVisible();
    expect(await screen.findByText('Permission verified for this path.')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create mount' }));

    await waitFor(() => expect(gateway.createKvV2Mount).toHaveBeenCalledWith(
      session,
      { path: 'team/platform', description: 'Platform secrets' },
    ));
    expect(await screen.findByRole('heading', { name: 'Platform secrets' })).toBeVisible();
    expect(screen.getByRole('button', { name: 'Open team/platform mount' })).toBeVisible();
    expect(window.location.pathname).toBe('/explorer/team%2Fplatform');
  });

  it('blocks mount creation when capabilities explicitly deny the target path', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={gateway} />);
    await login(user);
    await screen.findByRole('heading', { name: 'Application secrets' });

    await user.click(screen.getByRole('button', { name: 'Create KV v2 mount' }));
    await user.type(screen.getByLabelText('Mount path'), 'forbidden');

    expect(await screen.findByText(/cannot enable a secrets engine/)).toBeVisible();
    expect(screen.getByRole('button', { name: 'Create mount' })).toBeDisabled();
    expect(gateway.createKvV2Mount).not.toHaveBeenCalled();
  });

  it('discovers visible KV v2 mounts, lists a folder, and lazily reads a selected secret', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={gateway} />);
    await login(user);

    expect(await screen.findByRole('heading', { name: 'Application secrets' })).toBeVisible();
    expect(window.location.pathname).toBe('/explorer/applications');
    expect((await screen.findAllByText('billing/'))[0]).toBeVisible();
    await user.click((await screen.findAllByText('shared'))[0]);

    await waitFor(() => expect(screen.getByText('API_KEY')).toBeVisible());
    expect(window.location.search).toBe('?secret=shared');
    expect(gateway.readSecret).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
      undefined,
      expect.any(AbortSignal),
    );
    expect(await screen.findByRole('button', {
      name: 'Open recent path applications/shared',
    })).toBeVisible();
    const storedNavigation = sessionStorage.getItem(RECENT_PATHS_STORAGE_KEY) ?? '';
    expect(storedNavigation).toContain('"path":"shared"');
    expect(storedNavigation).not.toContain('memory-only-value');
    expect(storedNavigation).not.toContain('hvs.reader');

    await user.click(screen.getByRole('button', { name: 'Open folder billing/' }));
    await user.click(screen.getByRole('button', { name: 'Open command palette' }));
    const paletteSearch = await screen.findByRole('combobox', { name: 'Search commands' });
    await user.type(paletteSearch, 'shared');
    expect(screen.getByRole('option', { name: /applications\/shared/ })).toHaveTextContent(
      'Recent secret',
    );
    await user.keyboard('{Enter}');
    expect(window.location.pathname).toBe('/explorer/applications');
    expect(window.location.search).toBe('?secret=shared');
  });

  it('revokes the current token in Vault and returns to login with a notice', async () => {
    const user = userEvent.setup();
    const auth = authGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={auth} kvV2Gateway={kvGateway()} />);
    await login(user);
    await screen.findByRole('heading', { name: 'Application secrets' });

    await user.click(screen.getByRole('button', { name: 'Session menu for reader' }));
    await user.click(screen.getByRole('button', { name: 'Revoke token…' }));
    await user.click(screen.getByRole('button', { name: 'Revoke token' }));

    await waitFor(() => expect(auth.revokeSelf).toHaveBeenCalledWith(
      session,
      expect.any(AbortSignal),
    ));
    expect(await screen.findByText(
      'Token revoked. Sign in with another Vault token or userpass account.',
    )).toBeVisible();
    expect(window.location.pathname).toBe('/login');
  });

  it('renders authorization failures next to the denied folder', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={kvGateway({ denied: true })} />);
    await login(user);

    expect(await screen.findByText('This folder is outside your Vault policy')).toBeVisible();
  });

  it('opens an exact secret path while directory LIST remains denied', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway({ denied: true });
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={gateway} />);
    await login(user);

    expect(await screen.findByText('This folder is outside your Vault policy')).toBeVisible();
    await user.type(
      screen.getByLabelText('Secret path relative to applications'),
      ' /team/shared ',
    );
    await user.click(screen.getByRole('button', { name: 'Open exact path' }));

    expect(await screen.findByText('API_KEY')).toBeVisible();
    expect(window.location.pathname).toBe('/explorer/applications/team/');
    expect(window.location.search).toBe('?secret=team%2Fshared');
    expect(gateway.readSecret).toHaveBeenCalledWith(
      session,
      'applications',
      'team/shared',
      undefined,
      expect.any(AbortSignal),
    );
    expect(screen.getByText('This folder is outside your Vault policy')).toBeVisible();
  });

  it('shows secret data without calling denied metadata history', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway({ metadataRead: false })} kvV2Gateway={gateway} />);
    await login(user);

    await user.click((await screen.findAllByText('shared'))[0]);
    expect(await screen.findByText('API_KEY')).toBeVisible();
    expect(gateway.readSecret).toHaveBeenCalled();
    expect(gateway.readSecretMetadata).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'Versions' }));
    expect(screen.getByText('Version history is not allowed')).toBeVisible();
  });

  it('writes a complete secret with CAS 0 when data and metadata reads are denied', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway({ writeOnly: true })} kvV2Gateway={gateway} />);
    await login(user);

    await user.click((await screen.findAllByText('shared'))[0]);
    await user.click(await screen.findByRole('button', { name: 'Write new version…' }));
    expect(screen.getByText('Existing fields are unknown.')).toBeVisible();
    await user.type(screen.getAllByLabelText('Secret key')[0], 'TOKEN');
    await user.type(screen.getByLabelText('Value for TOKEN'), 'replacement-value');
    await user.click(screen.getByRole('button', { name: 'Review write' }));
    await user.click(screen.getByRole('button', { name: 'Write complete secret' }));

    await waitFor(() => expect(gateway.writeSecret).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
      { TOKEN: 'replacement-value' },
      { type: 'create-only' },
    ));
    expect(await screen.findByText(
      'Wrote applications/shared as version 3 with CAS 0.',
    )).toBeVisible();
    expect(gateway.readSecret).not.toHaveBeenCalled();
    expect(gateway.readSecretMetadata).not.toHaveBeenCalled();
  });

  it('allows a guarded write attempt when capability discovery and reads are denied', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    gateway.readSecret = vi.fn(async () => {
      throw new VaultError('authorization', { status: 403 });
    });
    gateway.readSecretMetadata = vi.fn(async () => {
      throw new VaultError('authorization', { status: 403 });
    });
    window.history.replaceState({}, '', '/login');
    render(<App
      authGateway={authGateway({ capabilitiesUnavailable: true })}
      kvV2Gateway={gateway}
    />);
    await login(user);

    await user.click((await screen.findAllByText('shared'))[0]);
    expect(await screen.findByText('Write permission could not be preflighted')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Try writing a new version…' }));
    await user.type(screen.getAllByLabelText('Secret key')[0], 'TOKEN');
    await user.type(screen.getByLabelText('Value for TOKEN'), 'authoritative-value');
    await user.click(screen.getByRole('button', { name: 'Review write' }));
    await user.click(screen.getByRole('button', { name: 'Write complete secret' }));

    await waitFor(() => expect(gateway.writeSecret).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
      { TOKEN: 'authoritative-value' },
      { type: 'create-only' },
    ));
  });

  it('keeps readable metadata and mount configuration actions available without preflight', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App
      authGateway={authGateway({ capabilitiesUnavailable: true })}
      kvV2Gateway={gateway}
    />);
    await login(user);

    expect(await screen.findByRole('button', { name: 'Configure mount' })).toBeVisible();
    await user.click((await screen.findAllByText('shared'))[0]);
    await screen.findByText('API_KEY');
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    expect(screen.getByRole('button', { name: 'Edit key metadata' })).toBeVisible();
  });

  it('fresh-loads and updates complete key metadata', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={gateway} />);
    await login(user);

    await user.click((await screen.findAllByText('shared'))[0]);
    await screen.findByText('API_KEY');
    await user.click(screen.getByRole('tab', { name: 'Metadata' }));
    await user.click(screen.getByRole('button', { name: 'Edit key metadata' }));
    expect(await screen.findByText(/Loaded fresh from Vault/)).toBeVisible();
    expect(gateway.readSecretMetadata).toHaveBeenCalledTimes(2);

    await user.clear(screen.getByLabelText('Maximum versions'));
    await user.type(screen.getByLabelText('Maximum versions'), '20');
    await user.click(screen.getByRole('button', { name: 'Save key metadata' }));

    await waitFor(() => expect(gateway.updateSecretMetadata).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
      {
        maxVersions: 20,
        casRequired: false,
        deleteVersionAfter: '0s',
        customMetadata: {},
      },
    ));
    expect(await screen.findByText('Updated key metadata for applications/shared.')).toBeVisible();
  });

  it('reads and updates the supported KV v2 mount configuration', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway({ mountConfig: true })} kvV2Gateway={gateway} />);
    await login(user);
    await screen.findByRole('heading', { name: 'Application secrets' });

    await user.click(await screen.findByRole('button', { name: 'Configure mount' }));
    expect(await screen.findByText(/Only KV v2 data-retention defaults/)).toBeVisible();
    await user.clear(screen.getByLabelText('Default maximum versions'));
    await user.type(screen.getByLabelText('Default maximum versions'), '30');
    await user.clear(screen.getByLabelText('Default delete delay'));
    await user.type(screen.getByLabelText('Default delete delay'), '168h');
    await user.click(screen.getByRole('button', { name: 'Save mount configuration' }));

    await waitFor(() => expect(gateway.updateMountConfig).toHaveBeenCalledWith(
      session,
      'applications',
      {
        maxVersions: 30,
        casRequired: false,
        deleteVersionAfter: '168h',
      },
    ));
    expect(await screen.findByText(
      'Updated KV v2 mount configuration for applications.',
    )).toBeVisible();
  });

  it('creates with CAS 0 and edits from the exact loaded version', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={gateway} />);
    await login(user);
    await screen.findByRole('heading', { name: 'Application secrets' });

    await user.click(screen.getByRole('button', { name: 'Create secret' }));
    await user.type(screen.getByLabelText('Secret name'), 'database');
    await user.type(screen.getAllByLabelText('Secret key')[0], 'USERNAME');
    await user.type(screen.getByLabelText('Value for USERNAME'), 'billing');
    await user.click(screen.getByRole('button', { name: 'Review & create' }));
    const createButtons = screen.getAllByRole('button', { name: 'Create secret' });
    await user.click(createButtons[createButtons.length - 1]);

    await waitFor(() => expect(gateway.writeSecret).toHaveBeenCalledWith(
      session,
      'applications',
      'database',
      { USERNAME: 'billing' },
      { type: 'create-only' },
    ));
    expect(await screen.findByText('Created applications/database at version 3.')).toBeVisible();

    await user.click((await screen.findAllByText('shared'))[0]);
    await screen.findByText('API_KEY');
    await user.click(await screen.findByRole('button', { name: 'Edit secret' }));
    await replaceEditorContent(user, JSON.stringify({ API_KEY: 'rotated' }));
    await user.click(screen.getByRole('button', { name: 'Save version 3' }));

    await waitFor(() => expect(gateway.writeSecret).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
      { API_KEY: 'rotated' },
      { type: 'check-and-set', version: 2 },
    ));
    expect(await screen.findByText(
      'Saved applications/shared as version 3 with check-and-set.',
    )).toBeVisible();
  });

  it('opens nested data full screen and preserves its structure when editing', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={gateway} />);
    await login(user);
    await user.click((await screen.findAllByText('nested'))[0]);
    await screen.findByText('service');

    expect(screen.getByText('object')).toBeVisible();
    expect(screen.getAllByText('3 items').length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Open inspector full screen' }));

    const workspace = await screen.findByRole('dialog', { name: 'applications/nested' });
    expect(workspace).toBeVisible();
    expect(screen.queryByText('nested-memory-value')).not.toBeInTheDocument();
    await user.click(within(workspace).getByRole('button', { name: 'Edit secret' }));

    const nextData = {
      service: {
        credentials: { access: 'rotated-nested-value' },
        ports: [443, 9443],
        enabled: false,
      },
    };
    await replaceEditorContent(user, JSON.stringify(nextData));
    await user.click(screen.getByRole('button', { name: 'Save version 3' }));

    await waitFor(() => expect(gateway.writeSecret).toHaveBeenCalledWith(
      session,
      'applications',
      'nested',
      nextData,
      { type: 'check-and-set', version: 2 },
    ));
  });

  it('opens the existing full-screen viewer without entering edit mode', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={kvGateway()} />);
    await login(user);
    await user.click((await screen.findAllByText('nested'))[0]);
    await screen.findByText('service');

    await user.click(screen.getByRole('button', { name: 'View secret full screen' }));

    const workspace = await screen.findByRole('dialog', {
      name: 'applications/nested',
    });
    expect(within(workspace).getByRole('button', { name: 'Reveal values' })).toBeVisible();
    expect(within(workspace).queryByLabelText('Secret JSON editor')).not.toBeInTheDocument();
    expect(within(workspace).queryByText('nested-memory-value')).not.toBeInTheDocument();
  });

  it('soft-deletes without typed friction and restores the exact version once', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={gateway} />);
    await login(user);
    await user.click((await screen.findAllByText('shared'))[0]);
    await screen.findByText('API_KEY');
    await user.click(screen.getByRole('tab', { name: /^Versions/ }));
    await user.click(screen.getByRole('button', { name: 'Version actions for version 2' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete current version 2' }));

    expect(screen.queryByLabelText('Type applications/shared to confirm')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Delete current version' }));

    await waitFor(() => expect(gateway.deleteLatestSecret).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
    ));
    expect(await screen.findByText(
      'Version 2 of applications/shared was soft-deleted.',
    )).toBeVisible();
    const undo = screen.getByRole('button', { name: 'Undo' });
    act(() => {
      undo.click();
      undo.click();
    });
    await waitFor(() => expect(gateway.undeleteVersions).toHaveBeenCalledTimes(1));
    expect(gateway.undeleteVersions).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
      [2],
    );
    expect(await screen.findByText(
      'Restored version 2 of applications/shared.',
    )).toBeVisible();
  });

  it('permanently deletes a key from its table row with typed confirmation', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={gateway} />);
    await login(user);
    await screen.findByRole('heading', { name: 'Application secrets' });

    await user.click(await screen.findByRole('button', {
      name: 'Delete key permanently shared',
    }));
    const dialog = await screen.findByRole('dialog', { name: 'Delete key permanently' });
    await user.type(
      within(dialog).getByLabelText('Type applications/shared to confirm'),
      'applications/shared',
    );
    await user.click(within(dialog).getByRole('button', { name: 'Delete key permanently' }));

    await waitFor(() => expect(gateway.deleteMetadata).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
    ));
    expect(await screen.findByText('Permanently deleted applications/shared.')).toBeVisible();
  });

  it('permanently deletes selected keys after exact bulk confirmation', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={gateway} />);
    await login(user);

    await user.click(await screen.findByRole('checkbox', { name: 'Select secret nested' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select secret shared' }));
    await user.click(screen.getByRole('button', { name: 'Delete keys permanently…' }));

    const dialog = await screen.findByRole('dialog', {
      name: 'Delete selected keys permanently',
    });
    await user.type(
      within(dialog).getByLabelText('Type DELETE 2 KEYS to confirm'),
      'DELETE 2 KEYS',
    );
    await user.click(within(dialog).getByRole('button', {
      name: 'Delete 2 keys permanently',
    }));

    await waitFor(() => expect(gateway.deleteMetadata).toHaveBeenCalledTimes(2));
    expect(gateway.deleteMetadata).toHaveBeenCalledWith(
      session,
      'applications',
      'nested',
      undefined,
    );
    expect(gateway.deleteMetadata).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
      undefined,
    );
    expect(await screen.findByText('Permanently deleted 2 keys.')).toBeVisible();
  });

  it('preflights and soft-deletes selected current versions with one exact bulk Undo', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={gateway} />);
    await login(user);
    await screen.findByRole('heading', { name: 'Application secrets' });

    await user.click(await screen.findByRole('checkbox', {
      name: 'Select secret nested',
    }));
    await user.click(screen.getByRole('checkbox', { name: 'Select secret shared' }));
    await user.click(screen.getByRole('button', { name: 'Soft-delete latest' }));

    const confirm = await screen.findByRole('button', {
      name: 'Soft-delete 2 current versions',
    });
    expect(screen.getAllByText('Undo available')).toHaveLength(2);
    await user.click(confirm);

    await waitFor(() => expect(gateway.deleteVersions).toHaveBeenCalledTimes(2));
    expect(gateway.deleteVersions).toHaveBeenCalledWith(
      session,
      'applications',
      'nested',
      [2],
      undefined,
    );
    expect(gateway.deleteVersions).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
      [2],
      undefined,
    );
    expect(await screen.findByText(
      '2 current versions were soft-deleted.',
    )).toBeVisible();
    expect(screen.queryByRole('toolbar', { name: 'Bulk secret actions' }))
      .not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Undo 2' }));
    await waitFor(() => expect(gateway.undeleteVersions).toHaveBeenCalledTimes(2));
    expect(gateway.undeleteVersions).toHaveBeenCalledWith(
      session,
      'applications',
      'nested',
      [2],
      undefined,
    );
    expect(gateway.undeleteVersions).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
      [2],
      undefined,
    );
  });

  it('destroys only explicitly checked versions after exact mount confirmation', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={gateway} />);
    await login(user);
    await screen.findByRole('heading', { name: 'Application secrets' });

    await user.click(await screen.findByRole('checkbox', {
      name: 'Select secret nested',
    }));
    await user.click(screen.getByRole('checkbox', { name: 'Select secret shared' }));
    await user.click(screen.getByRole('button', { name: 'Destroy versions…' }));

    await user.click(await screen.findByRole('checkbox', {
      name: 'Destroy nested version 1',
    }));
    await user.click(screen.getByRole('checkbox', {
      name: 'Destroy shared version 2',
    }));
    const confirm = screen.getByRole('button', {
      name: 'Destroy 2 versions permanently',
    });
    expect(confirm).toBeDisabled();
    await user.type(
      screen.getByLabelText('Type applications to confirm'),
      'applications',
    );
    await user.click(confirm);

    await waitFor(() => expect(gateway.destroyVersions).toHaveBeenCalledTimes(2));
    expect(gateway.destroyVersions).toHaveBeenCalledWith(
      session,
      'applications',
      'nested',
      [1],
      undefined,
    );
    expect(gateway.destroyVersions).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
      [2],
      undefined,
    );
    expect(await screen.findByText(
      'Permanently destroyed 2 versions across 2 secrets.',
    )).toBeVisible();
    expect(screen.queryByRole('button', { name: /^Undo/ }))
      .not.toBeInTheDocument();
  });

  it('keeps a failed soft-delete Undo as a persistent error', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    gateway.undeleteVersions = vi.fn(async () => {
      throw new VaultError('authorization', { status: 403 });
    });
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={gateway} />);
    await login(user);
    await user.click((await screen.findAllByText('shared'))[0]);
    await screen.findByText('API_KEY');
    await user.click(screen.getByRole('tab', { name: /^Versions/ }));
    await user.click(screen.getByRole('button', { name: 'Version actions for version 2' }));
    await user.click(await screen.findByRole('menuitem', {
      name: 'Delete current version 2',
    }));
    await user.click(screen.getByRole('button', { name: 'Delete current version' }));
    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByText('Undo failed for applications/shared v2')).toBeVisible();
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your Vault token does not allow this operation.',
    );
  });

  it('restores historical data as a new CAS-protected version', async () => {
    const user = userEvent.setup();
    const gateway = kvGateway();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={gateway} />);
    await login(user);
    await user.click((await screen.findAllByText('shared'))[0]);
    await screen.findByText('API_KEY');
    await user.click(screen.getByRole('tab', { name: /^Versions/ }));
    await user.click(screen.getByRole('button', { name: 'Compare version 1' }));
    await user.selectOptions(await screen.findByLabelText('Version B'), '1');
    await user.click(await screen.findByRole('button', { name: 'Restore v1' }));

    await waitFor(() => expect(gateway.writeSecret).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
      { API_KEY: 'old-memory-only-value' },
      { type: 'check-and-set', version: 2 },
    ));
  });
});
