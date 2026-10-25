import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ComponentProps, ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';

import { AccessControlGatewayContext } from '@/application/vault/AccessControlGatewayContext';
import type { KvActionPermissions } from '@/application/vault/useKvActionPermissions';
import type { KvSecretDetails } from '@/application/vault/useKvExplorerData';
import {
  VaultSessionContext,
  type VaultSessionContextValue,
} from '@/application/vault/VaultSessionContext';
import { WrappingGatewayContext } from '@/application/vault/WrappingGatewayContext';
import type {
  KvV2Secret,
  KvV2SecretHistory,
  VaultAccessControlGateway,
  VaultSession,
} from '@/domain/vault/contracts';
import { vaultToken, vaultWrappingToken } from '@/domain/vault/sensitive-value';
import type { VaultWrappingGateway } from '@/domain/vault/wrapping';
import { vaultAccessControlGatewayMock } from '@/test/vault-access-control-gateway';
import Inspector from './Inspector';

const session: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.operator'),
  authMethod: 'token',
};

const secret: KvV2Secret = {
  mount: 'applications',
  path: 'billing/database',
  data: { API_KEY: 'memory-only-value', DB_URL: 'postgres://db:5432/app' },
  metadata: { createdTime: '2026-07-23T01:00:00Z', version: 3, customMetadata: {}, destroyed: false },
};

const history: KvV2SecretHistory = {
  createdTime: '2026-07-21T01:00:00Z',
  updatedTime: '2026-07-23T01:00:00Z',
  currentVersion: 3,
  oldestVersion: 1,
  maxVersions: 10,
  casRequired: false,
  deleteVersionAfter: '0s',
  customMetadata: {},
  versions: [
    { version: 3, createdTime: '2026-07-23T01:00:00Z', destroyed: false },
    { version: 2, createdTime: '2026-07-22T01:00:00Z', destroyed: false },
    { version: 1, createdTime: '2026-07-21T01:00:00Z', destroyed: true },
  ],
};

const permissions: KvActionPermissions = {
  scope: 'applications/data/billing/database',
  discovery: 'resolved',
  canReadData: true,
  canReadMetadata: true,
  canEdit: true,
  canDeleteVersions: false,
  canUndelete: false,
  canDestroy: false,
  canDeleteMetadata: false,
};

function vaultContext(accessDenied = false): VaultSessionContextValue {
  return {
    status: 'authenticated',
    session,
    accessControlPermission: accessDenied
      ? { state: 'denied', reason: 'Vault policy denies sys/policies/acl.' }
      : { state: 'allowed' },
  } as unknown as VaultSessionContextValue;
}

function wrappingGatewayMock(): VaultWrappingGateway {
  return {
    wrapKvSecretVersion: vi.fn(async () => ({
      token: vaultWrappingToken('hvs.CAESone-time-token'),
      ttlSeconds: 300,
      creationTime: new Date().toISOString(),
      creationPath: 'applications/data/billing/database',
    })),
    lookupWrappingToken: vi.fn(),
    unwrapSecret: vi.fn(),
  };
}

interface Environment {
  readonly accessGateway?: VaultAccessControlGateway;
  readonly wrappingGateway?: VaultWrappingGateway;
  readonly accessDenied?: boolean;
}

function Providers({ children, environment }: { readonly children: ReactNode; readonly environment: Environment }) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return (
    <QueryClientProvider client={queryClient}>
      <VaultSessionContext.Provider value={vaultContext(environment.accessDenied)}>
        <AccessControlGatewayContext.Provider value={environment.accessGateway ?? vaultAccessControlGatewayMock()}>
          <WrappingGatewayContext.Provider value={environment.wrappingGateway ?? null}>
            {children}
          </WrappingGatewayContext.Provider>
        </AccessControlGatewayContext.Provider>
      </VaultSessionContext.Provider>
    </QueryClientProvider>
  );
}

function renderInspector(
  details: KvSecretDetails = { secret, history },
  overrides: Partial<ComponentProps<typeof Inspector>> = {},
  environment?: Environment,
) {
  const inspector = (
    <Inspector
      state={{ status: 'success', data: details }}
      mount="applications"
      path="billing/database"
      onRetry={vi.fn()}
      permissions={permissions}
      {...overrides}
    />
  );
  return render(environment ? <Providers environment={environment}>{inspector}</Providers> : inspector);
}

function stubClipboard() {
  const writeText = vi.fn(async (_value: string) => undefined);
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
  return writeText;
}

describe('Inspector copy helpers', () => {
  it('copies the path, CLI command, .env, and JSON only from explicit actions with non-sensitive feedback', async () => {
    const user = userEvent.setup();
    const writeText = stubClipboard();
    renderInspector();

    await user.click(screen.getByRole('button', { name: 'Copy options' }));
    expect(screen.getByRole('menu', { name: 'Copy options' })).toBeVisible();
    expect(writeText).not.toHaveBeenCalled();
    await user.click(screen.getByRole('menuitem', { name: /Copy logical path/ }));
    expect(writeText).toHaveBeenLastCalledWith('applications/billing/database');
    expect(await screen.findByText('Logical path copied', { selector: '[role="status"]' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy options' }));
    await user.click(screen.getByRole('menuitem', { name: /Copy CLI command/ }));
    expect(writeText).toHaveBeenLastCalledWith('vault kv get -mount=applications billing/database');

    await user.click(screen.getByRole('button', { name: 'Copy options' }));
    await user.click(screen.getByRole('menuitem', { name: /Copy as \.env/ }));
    expect(writeText).toHaveBeenLastCalledWith('API_KEY=memory-only-value\nDB_URL=postgres://db:5432/app\n');
    expect(await screen.findByText('Copied as .env', { selector: '[role="status"]' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Copy options' }));
    await user.click(screen.getByRole('menuitem', { name: /Copy as JSON/ }));
    expect(JSON.parse(writeText.mock.lastCall?.[0] ?? '')).toEqual(secret.data);
    expect(await screen.findByText('Copied as JSON', { selector: '[role="status"]' })).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent('memory-only-value');
  });

  it('disables .env export with a reason when values are not flat strings', async () => {
    const user = userEvent.setup();
    renderInspector({ secret: { ...secret, data: { CONFIG: { token: 'nested-memory-value' } } }, history });

    await user.click(screen.getByRole('button', { name: 'Copy options' }));
    const envItem = screen.getByRole('menuitem', { name: /Copy as \.env/ });
    expect(envItem).toBeDisabled();
    expect(envItem).toHaveTextContent('Field "CONFIG" is not a plain text value');
    expect(screen.getByRole('menuitem', { name: /Copy as JSON/ })).toBeEnabled();

    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Copy options' })).toHaveFocus();
  });

  it('keeps path copies available when the data cannot be read', async () => {
    const user = userEvent.setup();
    renderInspector({ history });

    await user.click(screen.getByRole('button', { name: 'Copy options' }));
    expect(screen.getByRole('menuitem', { name: /Copy logical path/ })).toBeEnabled();
    expect(screen.getByRole('menuitem', { name: /Copy as JSON/ })).toBeDisabled();
  });
});

describe('Inspector versions and loading', () => {
  it('marks older versions neutrally and destroyed versions with a struck-through number', async () => {
    const user = userEvent.setup();
    renderInspector();
    await user.click(screen.getByRole('tab', { name: /Versions/ }));

    expect(screen.getByText('Older').className).toContain('bg-background-200');
    const destroyed = screen.getByText('v1');
    expect(destroyed.tagName).toBe('S');
    expect(screen.getByText('Destroyed')).toBeVisible();
  });

  it('shows a skeleton shaped like the Inspector while loading', () => {
    render(<Inspector state={{ status: 'loading' }} mount="applications" path="billing/database" onRetry={vi.fn()} />);
    expect(screen.getByRole('status', { name: 'Loading secret' })).toBeInTheDocument();
  });
});

describe('Inspector Access tab', () => {
  it('is omitted without a session or when access-control reads are denied', () => {
    const { unmount } = renderInspector();
    expect(screen.queryByRole('tab', { name: 'Access' })).not.toBeInTheDocument();
    unmount();

    renderInspector(undefined, {}, { accessDenied: true });
    expect(screen.queryByRole('tab', { name: 'Access' })).not.toBeInTheDocument();
  });

  it('loads lazily and lists subjects with capabilities, provenance, and an honest incomplete state', async () => {
    const user = userEvent.setup();
    const accessGateway = vaultAccessControlGatewayMock({
      listAuthMounts: vi.fn(async () => [{ path: 'userpass', accessor: 'auth_up', type: 'userpass', description: '' }]),
      listUserpassAccounts: vi.fn(async () => [
        { username: 'alice', mount: 'userpass', tokenPolicies: [], tokenNoDefaultPolicy: true },
        { username: 'bob', mount: 'userpass', tokenPolicies: ['secret-legacy'], tokenNoDefaultPolicy: true },
      ]),
      listEntities: vi.fn(async () => [{
        id: 'e-alice',
        name: 'alice',
        disabled: false,
        policies: [],
        groupIds: [],
        aliases: [{ id: 'a1', name: 'alice', canonicalId: 'e-alice', mountAccessor: 'auth_up' }],
      }]),
      listGroups: vi.fn(async () => [{
        id: 'g-billing',
        name: 'billing',
        policies: ['vc-role-billing-owner'],
        memberEntityIds: ['e-alice'],
        memberGroupIds: [],
        metadata: {},
      }]),
      listPolicies: vi.fn(async () => ['secret-legacy', 'vc-role-billing-owner']),
      readPolicy: vi.fn(async (_session, name: string) => {
        if (name === 'secret-legacy') throw new Error('network');
        return {
          name,
          policy: [
            'path "applications/data/billing/*" {\n  capabilities = ["read", "update", "create"]\n}',
            'path "applications/destroy/billing/*" {\n  capabilities = ["update"]\n}',
          ].join('\n'),
        };
      }),
    });
    renderInspector(undefined, {}, { accessGateway });

    expect(accessGateway.listAuthMounts).not.toHaveBeenCalled();
    await user.click(screen.getByRole('tab', { name: 'Access' }));

    const users = await screen.findByRole('region', { name: 'Users' });
    const alice = within(users).getByText('alice').closest('li')!;
    expect(within(alice).getAllByRole('listitem').map((chip) => chip.textContent)).toEqual(['Read', 'Write', 'Destroy']);
    expect(alice).toHaveTextContent('via group billing · role Billing Owner');
    expect(within(screen.getByRole('region', { name: 'Groups' })).getByText('billing')).toBeVisible();
    expect(within(screen.getByRole('region', { name: 'Roles' })).getByText('Billing Owner')).toBeVisible();

    const notice = screen.getByText('Some access could not be checked').closest('[role="status"]')!;
    expect(notice).toHaveTextContent('Policy secret-legacy could not be loaded.');
    expect(notice).toHaveTextContent('1 subject could not be checked');
  });
});

describe('Inspector Share once', () => {
  it('is hidden without wrapping support or when the secret data cannot be read', () => {
    const { unmount } = renderInspector(undefined, {}, {});
    expect(screen.queryByRole('button', { name: 'Share once' })).not.toBeInTheDocument();
    unmount();

    renderInspector(undefined, { permissions: { ...permissions, canReadData: false } }, { wrappingGateway: wrappingGatewayMock() });
    expect(screen.queryByRole('button', { name: 'Share once' })).not.toBeInTheDocument();
  });

  it('wraps the loaded version with the chosen TTL and shows the token once, masked until revealed', async () => {
    const user = userEvent.setup();
    const wrappingGateway = wrappingGatewayMock();
    renderInspector(undefined, {}, { wrappingGateway });

    await user.click(screen.getByRole('button', { name: 'Share once' }));
    const dialog = screen.getByRole('dialog', { name: 'Share once' });
    expect(within(dialog).getByRole('radio', { name: '1 hour' })).toBeChecked();
    await user.click(within(dialog).getByRole('radio', { name: '5 minutes' }));
    expect(wrappingGateway.wrapKvSecretVersion).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Create one-time token' }));

    expect(await within(dialog).findByText('One-time token created')).toBeVisible();
    expect(wrappingGateway.wrapKvSecretVersion).toHaveBeenCalledWith(
      session, 'applications', 'billing/database', 3, '5m', expect.any(AbortSignal),
    );
    expect(dialog).not.toHaveTextContent('hvs.CAESone-time-token');
    expect(dialog).toHaveTextContent('Anyone with this token can read the secret once until it expires');
    expect(dialog).toHaveTextContent(/Expires .+\(in [45]m\)/);
    expect(dialog).toHaveTextContent('/unwrap');

    const writeText = stubClipboard();
    await user.click(within(dialog).getByRole('button', { name: 'Copy token' }));
    expect(writeText).toHaveBeenCalledWith('hvs.CAESone-time-token');
    expect(dialog).not.toHaveTextContent('hvs.CAESone-time-token');

    await user.click(within(dialog).getByRole('button', { name: 'Reveal wrapping token' }));
    expect(dialog).toHaveTextContent('hvs.CAESone-time-token');
    expect(window.location.href).not.toContain('hvs.');
    expect(JSON.stringify({ ...sessionStorage, ...localStorage })).not.toContain('hvs.CAES');

    await user.click(within(dialog).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Share once' }));
    expect(await screen.findByRole('button', { name: 'Create one-time token' })).toBeVisible();
    expect(screen.queryByText('One-time token created')).not.toBeInTheDocument();
  });
});
