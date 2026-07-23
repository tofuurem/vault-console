import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import App from '@/App';
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

function authGateway(options: { metadataRead?: boolean; mountAdmin?: boolean } = {}): VaultAuthGateway {
  return {
    getHealth: vi.fn(async (): Promise<VaultHealth> => ({ initialized: true, sealed: false, standby: false, version: '1.21.0' })),
    validateToken: vi.fn(async (_serverUrl: string, _token: VaultToken) => session),
    loginUserpass: vi.fn(async (_input: UserpassLogin) => session),
    getCapabilities: vi.fn(async (_session, paths): Promise<VaultCapabilityMap> => Object.fromEntries(
      paths.map((path) => [
        path,
        path.startsWith('sys/mounts/') && options.mountAdmin
          ? ['create', 'update', 'sudo']
          : path.startsWith('sys/') || path.startsWith('identity/')
          ? ['deny']
          : path.includes('/data/')
            ? ['create', 'read', 'update', 'delete']
            : path.includes('/metadata/')
              ? options.metadataRead === false ? ['list'] : ['read', 'list', 'delete']
              : ['update'],
      ]),
    ) as VaultCapabilityMap),
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
    readSecretHistory: vi.fn(async () => ({
      currentVersion: 2,
      oldestVersion: 1,
      customMetadata: {},
      versions: [
        { version: 2, createdTime: '2026-07-21T12:00:00Z', destroyed: false },
        { version: 1, createdTime: '2026-07-20T12:00:00Z', destroyed: false },
      ],
    })),
    writeSecret: vi.fn(async () => 3),
    deleteLatestVersion: vi.fn(async () => undefined),
    deleteVersions: vi.fn(async () => undefined),
    undeleteVersions: vi.fn(async () => undefined),
    destroyVersions: vi.fn(async () => undefined),
    deleteMetadata: vi.fn(async () => undefined),
  };
}

async function login(user: ReturnType<typeof userEvent.setup>) {
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
  });

  it('renders authorization failures next to the denied folder', async () => {
    const user = userEvent.setup();
    window.history.replaceState({}, '', '/login');
    render(<App authGateway={authGateway()} kvV2Gateway={kvGateway({ denied: true })} />);
    await login(user);

    expect(await screen.findByText('This folder is outside your Vault policy')).toBeVisible();
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
    expect(gateway.readSecretHistory).not.toHaveBeenCalled();

    await user.click(screen.getByRole('tab', { name: 'Versions' }));
    expect(screen.getByText('Version history is not allowed')).toBeVisible();
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
      0,
    ));

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
      2,
    ));
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
    await user.click(screen.getByRole('button', { name: 'Open secret full screen' }));

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
      2,
    ));
  });

  it('guards a soft delete with the full logical path', async () => {
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

    await user.type(screen.getByLabelText('Type applications/shared to confirm'), 'applications/shared');
    await user.click(screen.getByRole('button', { name: 'Delete current version' }));

    await waitFor(() => expect(gateway.deleteLatestVersion).toHaveBeenCalledWith(
      session,
      'applications',
      'shared',
    ));
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
      2,
    ));
  });
});
