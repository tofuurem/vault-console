import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate, useParams } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import type {
  DatabaseConnection,
  DatabaseEngineGateway,
  DatabaseRole,
  DatabaseStaticRole,
} from '@/domain/engines/database/database';
import { VaultError } from '@/domain/vault/errors';
import { engineRoute } from '@/router/engine-route';
import { renderWithEngines, testEngine } from '@/test/engines';
import DatabaseEnginePage from './page';

const CONNECTION: DatabaseConnection = {
  name: 'pg',
  pluginName: 'postgresql-database-plugin',
  connectionUrl: 'postgresql://{{username}}:{{password}}@db:5432/app',
  username: 'vault',
  allowedRoles: ['*'],
  verifyConnection: true,
  passwordPolicy: '',
  rootRotationStatements: [],
  otherSettings: { max_open_connections: 4 },
};

const ROLE: DatabaseRole = {
  name: 'web',
  dbName: 'pg',
  creationStatements: ['CREATE ROLE "{{name}}";'],
  revocationStatements: [],
  rollbackStatements: [],
  renewStatements: [],
  defaultTtlSeconds: 3600,
  maxTtlSeconds: 86400,
  credentialType: 'password',
};

const STATIC_ROLE: DatabaseStaticRole = {
  name: 'app',
  dbName: 'pg',
  username: 'appuser',
  rotation: { kind: 'period', periodSeconds: 86400 },
  rotationStatements: [],
  lastVaultRotation: '2026-10-25T15:36:08Z',
  credentialType: 'password',
};

function fakeGateway(overrides: Partial<DatabaseEngineGateway> = {}): DatabaseEngineGateway {
  return {
    listConnections: vi.fn(async () => ['pg']),
    readConnection: vi.fn(async () => CONNECTION),
    writeConnection: vi.fn(async () => undefined),
    deleteConnection: vi.fn(async () => undefined),
    resetConnection: vi.fn(async () => undefined),
    rotateRootCredentials: vi.fn(async () => undefined),
    listRoles: vi.fn(async () => ['web']),
    readRole: vi.fn(async () => ROLE),
    writeRole: vi.fn(async () => undefined),
    deleteRole: vi.fn(async () => undefined),
    generateCredentials: vi.fn(async () => ({
      data: { username: 'v-token-web-abc', password: 'generated-secret' },
      leaseId: 'db/creds/web/lease1',
      leaseDurationSeconds: 3600,
      renewable: true,
      warnings: [],
    })),
    renewLease: vi.fn(async () => ({ leaseId: 'db/creds/web/lease1', leaseDurationSeconds: 7200, renewable: true })),
    revokeLease: vi.fn(async () => undefined),
    listStaticRoles: vi.fn(async () => ['app']),
    readStaticRole: vi.fn(async () => STATIC_ROLE),
    writeStaticRole: vi.fn(async () => undefined),
    deleteStaticRole: vi.fn(async () => undefined),
    readStaticCredentials: vi.fn(async () => ({
      username: 'appuser',
      password: 'static-secret',
      lastVaultRotation: '2026-10-25T15:36:08Z',
      ttlSeconds: 1200,
      rotation: { kind: 'period' as const, periodSeconds: 86400 },
    })),
    rotateStaticRole: vi.fn(async () => undefined),
    ...overrides,
  };
}

function Harness({ gateway }: { readonly gateway: DatabaseEngineGateway }) {
  const subPath = useParams()['*'] ?? '';
  const navigate = useNavigate();
  return (
    <DatabaseEnginePage
      engine={testEngine('db', 'database')}
      subPath={subPath}
      navigateTo={(path) => navigate(engineRoute('db', path))}
      gateway={gateway}
    />
  );
}

function renderPage(url: string, gateway = fakeGateway()) {
  const result = renderWithEngines(<Harness gateway={gateway} />, { url, route: '/engines/db/*' });
  return { ...result, gateway };
}

const location = () => screen.getByLabelText('Current location');

describe('DatabaseEnginePage connections', () => {
  it('guides an empty engine to add a connection first', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway({
      listConnections: vi.fn(async () => []),
      listRoles: vi.fn(async () => []),
      listStaticRoles: vi.fn(async () => []),
    });
    renderPage('/engines/db', gateway);
    expect(await screen.findByRole('heading', { name: 'No connections yet' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: /Roles/ }));
    expect(location()).toHaveTextContent('/engines/db/roles');
    expect(await screen.findByText(/Add a connection first, then create roles/)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Add connection' }));
    expect(location()).toHaveTextContent('/engines/db/config/~new');
    expect(await screen.findByRole('region', { name: 'New connection' })).toBeVisible();
  });

  it('creates a connection with a plugin template and a write-only password', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    renderPage('/engines/db/config/~new', gateway);
    const form = await screen.findByRole('region', { name: 'New connection' });

    await user.click(within(form).getByRole('button', { name: 'Create connection' }));
    expect(within(form).getByText('Enter a name.')).toBeVisible();
    expect(gateway.writeConnection).not.toHaveBeenCalled();

    await user.type(within(form).getByLabelText('Connection name'), 'mysql');
    await user.click(within(form).getByRole('radio', { name: 'MySQL / MariaDB' }));
    await user.click(within(form).getByRole('button', { name: 'Use MySQL / MariaDB example' }));
    expect(within(form).getByLabelText('Connection URL')).toHaveValue('{{username}}:{{password}}@tcp(db.internal:3306)/');
    await user.type(within(form).getByLabelText('Username'), 'vault');
    await user.type(within(form).getByLabelText('Password'), 's3cret');
    await user.click(within(form).getByRole('button', { name: 'Create connection' }));

    await waitFor(() => expect(gateway.writeConnection).toHaveBeenCalledTimes(1));
    const [, mount, input] = vi.mocked(gateway.writeConnection).mock.calls[0];
    expect(mount).toBe('db');
    expect(input).toMatchObject({
      name: 'mysql',
      pluginName: 'mysql-database-plugin',
      urlParameter: 'connection_url',
      username: 'vault',
      allowedRoles: ['*'],
      verifyConnection: true,
    });
    expect(input.password?.reveal()).toBe('s3cret');
    await waitFor(() => expect(location()).toHaveTextContent('/engines/db/config/mysql'));
    expect(screen.queryByDisplayValue('s3cret')).not.toBeInTheDocument();
  });

  it('shows the Vault reason when a connection cannot be verified', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway({
      writeConnection: vi.fn(async () => {
        throw new VaultError('invalid-request', { reason: 'error verifying connection: ping failed' });
      }),
    });
    renderPage('/engines/db/config/pg/edit', gateway);
    const form = await screen.findByRole('region', { name: 'Edit pg' });
    expect(within(form).getByLabelText('Password')).toHaveValue('');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(await within(form).findByText('Vault reported: error verifying connection: ping failed')).toBeVisible();
    const [, , input] = vi.mocked(gateway.writeConnection).mock.calls[0];
    expect(input.password).toBeUndefined();
  });

  it('rotates root credentials and deletes only after typing the name', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    renderPage('/engines/db/config/pg', gateway);
    expect(await screen.findByText('Stored in Vault, never shown')).toBeVisible();
    expect(screen.getByText('max_open_connections')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Rotate root' }));
    const rotateDialog = await screen.findByRole('dialog', { name: 'Rotate root credentials' });
    expect(within(rotateDialog).getByText(/the root password is known only to Vault/)).toBeVisible();
    const rotate = within(rotateDialog).getByRole('button', { name: 'Rotate root password' });
    expect(rotate).toBeDisabled();
    await user.type(within(rotateDialog).getByLabelText('Type pg to confirm'), 'pg');
    await user.click(rotate);
    await waitFor(() => expect(gateway.rotateRootCredentials).toHaveBeenCalledWith(expect.anything(), 'db', 'pg'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    const deleteDialog = await screen.findByRole('dialog', { name: 'Delete connection' });
    await user.type(within(deleteDialog).getByLabelText('Type pg to confirm'), 'pg');
    await user.click(within(deleteDialog).getByRole('button', { name: 'Delete connection' }));
    await waitFor(() => expect(gateway.deleteConnection).toHaveBeenCalledWith(expect.anything(), 'db', 'pg'));
    await waitFor(() => expect(location()).toHaveTextContent(/\/engines\/db\/config$/));
  });

  it('explains permission errors plainly', async () => {
    renderPage('/engines/db/roles', fakeGateway({
      listRoles: vi.fn(async () => {
        throw new VaultError('authorization', { status: 403 });
      }),
    }));
    expect(await screen.findByText('Your policy does not allow listing roles on db/.')).toBeVisible();
  });
});

describe('DatabaseEnginePage roles', () => {
  it('generates masked credentials, renews and revokes the lease, and keeps them out of the query cache', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    const { client } = renderPage('/engines/db/roles/web', gateway);

    expect(await screen.findByRole('heading', { name: 'web' })).toBeVisible();
    expect(screen.getByText(/Each request creates a new database user/)).toBeVisible();
    expect(gateway.generateCredentials).not.toHaveBeenCalled();
    await user.click(screen.getByRole('button', { name: 'Generate credentials' }));

    const panel = await screen.findByRole('region', { name: 'Credentials for web' });
    expect(within(panel).getByText('db/creds/web/lease1')).toBeVisible();
    expect(within(panel).queryByText('generated-secret')).not.toBeInTheDocument();
    const cached = JSON.stringify([
      ...client.getQueryCache().getAll().map((query) => query.state.data),
      ...client.getMutationCache().getAll().map((mutation) => mutation.state.data),
    ]);
    expect(cached).not.toContain('generated-secret');

    await user.type(screen.getByLabelText('Extend by'), '2h');
    await user.click(screen.getByRole('button', { name: 'Renew lease' }));
    await waitFor(() => expect(gateway.renewLease).toHaveBeenCalledWith(expect.anything(), 'db/creds/web/lease1', '2h'));
    expect(await within(panel).findByText(/2h · renewable/)).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Revoke lease' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Revoke lease' })).getByRole('button', { name: 'Revoke lease' }));
    await waitFor(() => expect(gateway.revokeLease).toHaveBeenCalledWith(expect.anything(), 'db/creds/web/lease1'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Credentials for web' })).not.toBeInTheDocument());
  });

  it('shows why Vault refused to issue credentials', async () => {
    const user = userEvent.setup();
    renderPage('/engines/db/roles/web', fakeGateway({
      generateCredentials: vi.fn(async () => {
        throw new VaultError('invalid-request', { reason: '"web" is not an allowed role' });
      }),
    }));
    await user.click(await screen.findByRole('button', { name: 'Generate credentials' }));
    expect(await screen.findByText('Vault reported: "web" is not an allowed role')).toBeVisible();
  });

  it('creates a role from a template with validated TTLs', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway({ listRoles: vi.fn(async () => []) });
    renderPage('/engines/db/roles/~new/pg', gateway);
    const form = await screen.findByRole('region', { name: 'New role' });

    await user.type(within(form).getByLabelText('Role name'), 'readonly');
    expect(within(form).getByLabelText('Connection')).toHaveValue('pg');
    const maxTtl = within(form).getByLabelText('Max TTL');
    await user.clear(maxTtl);
    await user.type(maxTtl, 'forever');
    await user.click(within(form).getByRole('button', { name: 'Use template' }));
    expect((within(form).getByLabelText('Creation statements') as HTMLTextAreaElement).value).toContain('VALID UNTIL');
    await user.click(within(form).getByRole('button', { name: 'Create role' }));
    expect(within(form).getByText('Use a duration such as 30m, 24h, or 720h.')).toBeVisible();
    expect(gateway.writeRole).not.toHaveBeenCalled();

    await user.clear(maxTtl);
    await user.type(maxTtl, '8h');
    await user.click(within(form).getByRole('button', { name: 'Create role' }));
    await waitFor(() => expect(gateway.writeRole).toHaveBeenCalledWith(expect.anything(), 'db', expect.objectContaining({
      name: 'readonly',
      dbName: 'pg',
      defaultTtl: '1h',
      maxTtl: '8h',
      creationStatements: [expect.stringContaining('CREATE ROLE "{{name}}"')],
    })));
    await waitFor(() => expect(location()).toHaveTextContent('/engines/db/roles/readonly'));
  });

  it('warns when the connection does not allow the role', async () => {
    renderPage('/engines/db/roles/web', fakeGateway({
      readConnection: vi.fn(async () => ({ ...CONNECTION, allowedRoles: ['app-*'] })),
    }));
    expect(await screen.findByText(/does not list web in its allowed roles/)).toBeVisible();
  });

  it('deletes a role after confirmation', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    renderPage('/engines/db/roles/web', gateway);
    await user.click(await screen.findByRole('button', { name: 'Delete' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Delete role web' })).getByRole('button', { name: 'Delete role' }));
    await waitFor(() => expect(gateway.deleteRole).toHaveBeenCalledWith(expect.anything(), 'db', 'web'));
    await waitFor(() => expect(location()).toHaveTextContent(/\/engines\/db\/roles$/));
  });
});

describe('DatabaseEnginePage static roles', () => {
  it('reads the current password on request and rotates it after confirmation', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    renderPage('/engines/db/static-roles/app', gateway);
    expect(await screen.findByText('Every 1d')).toBeVisible();
    expect(gateway.readStaticCredentials).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Get credentials' }));
    const panel = await screen.findByRole('region', { name: 'Credentials for app' });
    expect(within(panel).queryByText('static-secret')).not.toBeInTheDocument();
    expect(screen.getByText('in 20m')).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Rotate now' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Rotate password now' })).getByRole('button', { name: 'Rotate now' }));
    await waitFor(() => expect(gateway.rotateStaticRole).toHaveBeenCalledWith(expect.anything(), 'db', 'app'));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Credentials for app' })).not.toBeInTheDocument());
  });

  it('creates a scheduled static role and keeps the username fixed on edit', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    renderPage('/engines/db/static-roles/~new', gateway);
    const form = await screen.findByRole('region', { name: 'New static role' });
    expect(within(form).getByText(/changes this user's password as soon as the role is created/)).toBeVisible();

    await user.type(within(form).getByLabelText('Role name'), 'svc');
    await user.type(within(form).getByLabelText('Database user'), 'svc_user');
    await user.click(within(form).getByRole('radio', { name: /On a schedule/ }));
    await user.type(within(form).getByLabelText('Cron schedule'), '0 3 * * SAT');
    await user.click(within(form).getByRole('button', { name: 'Create static role' }));
    await waitFor(() => expect(gateway.writeStaticRole).toHaveBeenCalledWith(expect.anything(), 'db', {
      name: 'svc',
      dbName: 'pg',
      username: 'svc_user',
      rotation: { kind: 'schedule', schedule: '0 3 * * SAT', window: '' },
      rotationStatements: [],
    }));
  });

  it('locks the database user when editing', async () => {
    renderPage('/engines/db/static-roles/app/edit');
    const form = await screen.findByRole('region', { name: 'Edit app' });
    expect(within(form).getByLabelText('Database user')).toBeDisabled();
    expect(within(form).getByLabelText('Rotation period')).toHaveValue('24h');
  });
});
