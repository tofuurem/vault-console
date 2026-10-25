import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate, useParams } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';

import { sshOtp, type SshCaRole, type SshEngineGateway } from '@/domain/engines/ssh/ssh';
import vaultEd25519UserCert from '@/domain/engines/ssh/fixtures/vault-ed25519-user-cert.pub?raw';
import userEd25519 from '@/domain/engines/ssh/fixtures/user-ed25519.pub?raw';
import { VaultError } from '@/domain/vault/errors';
import { engineRoute } from '@/router/engine-route';
import { renderWithEngines, testEngine } from '@/test/engines';
import SshEnginePage from './page';

const ENGINE = testEngine('ssh', 'ssh', { description: 'Team SSH' });
const CA_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMBnnfWU9yMBeu4YrxIY42vt0Qr/h3nBSWpwr+XNtp1f';
const OTP = 'c216522d-0b57-7384-f549-ed4751e61652';

const OPS_ROLE: SshCaRole = {
  keyType: 'ca',
  allowUserCertificates: true,
  allowHostCertificates: false,
  allowedUsers: '*',
  defaultUser: 'ubuntu',
  allowedDomains: '',
  allowSubdomains: false,
  allowBareDomains: false,
  allowedExtensions: 'permit-pty,permit-port-forwarding',
  defaultExtensions: { 'permit-pty': '' },
  allowedCriticalOptions: '',
  defaultCriticalOptions: {},
  allowUserKeyIds: true,
  keyIdFormat: '',
  algorithmSigner: 'default',
  allowedUserKeyLengths: {},
  ttlSeconds: 1800,
  maxTtlSeconds: 86400,
  notBeforeDurationSeconds: 30,
  allowedUsersTemplate: false,
  allowedDomainsTemplate: false,
  defaultUserTemplate: false,
  defaultExtensionsTemplate: false,
  allowEmptyPrincipals: false,
};

function fakeGateway(overrides: Partial<SshEngineGateway> = {}): SshEngineGateway {
  return {
    readCa: vi.fn(async () => ({ publicKey: CA_KEY })),
    configureCa: vi.fn(async () => ({ publicKey: CA_KEY })),
    deleteCa: vi.fn(async () => undefined),
    listRoles: vi.fn(async () => [{ name: 'ops', keyType: 'ca' }, { name: 'otp1', keyType: 'otp' }]),
    readRole: vi.fn(async (_session, _mount, name: string) => (name === 'otp1'
      ? { keyType: 'otp' as const, defaultUser: 'ubuntu', allowedUsers: '', cidrList: '10.0.0.0/8', excludeCidrList: '', port: 22 }
      : OPS_ROLE)),
    writeRole: vi.fn(async () => undefined),
    deleteRole: vi.fn(async () => undefined),
    signKey: vi.fn(async () => ({ serialNumber: '6b74e33818c22396', signedKey: vaultEd25519UserCert.trim() })),
    createOtp: vi.fn(async () => ({
      otp: sshOtp(OTP),
      ip: '10.1.2.3',
      username: 'ubuntu',
      port: 22,
      leaseId: 'ssh/creds/otp1/abc',
      leaseDurationSeconds: 2764800,
    })),
    verifyOtp: vi.fn(async () => null),
    readZeroAddressRoles: vi.fn(async () => []),
    writeZeroAddressRoles: vi.fn(async () => undefined),
    ...overrides,
  };
}

function Harness({ gateway }: { readonly gateway: SshEngineGateway }) {
  const subPath = useParams()['*'] ?? '';
  const navigate = useNavigate();
  return <SshEnginePage engine={ENGINE} subPath={subPath} navigateTo={(path) => navigate(engineRoute('ssh', path))} gateway={gateway} />;
}

function renderPage(url: string, gateway = fakeGateway()) {
  return { ...renderWithEngines(<Harness gateway={gateway} />, { url, route: '/engines/ssh/*' }), gateway };
}

const location = () => screen.getByLabelText('Current location');

describe('SshEnginePage', () => {
  it('explains the empty CA and generates one in Vault', async () => {
    const user = userEvent.setup();
    let configured = false;
    const gateway = fakeGateway({
      readCa: vi.fn(async () => (configured ? { publicKey: CA_KEY } : null)),
      configureCa: vi.fn(async () => {
        configured = true;
        return { publicKey: CA_KEY };
      }),
      listRoles: vi.fn(async () => []),
    });
    renderPage('/engines/ssh', gateway);

    expect(await screen.findByRole('heading', { name: 'No signing CA yet' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Generate signing CA' }));
    await waitFor(() => expect(gateway.configureCa).toHaveBeenCalledWith(expect.anything(), 'ssh', { mode: 'generate', keyType: 'ssh-ed25519' }));
    expect(await screen.findByText('Vault generated a new signing CA.')).toBeVisible();
    expect(await screen.findByText('Next: create a role')).toBeVisible();
  });

  it('imports a key pair and validates it first', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway({ readCa: vi.fn(async () => null), configureCa: vi.fn(async () => null) });
    renderPage('/engines/ssh/ca', gateway);

    await user.click(await screen.findByRole('radio', { name: 'Import key pair' }));
    await user.click(screen.getByRole('button', { name: 'Import key pair' }));
    expect(screen.getByText('Paste the CA private key.')).toBeVisible();
    expect(gateway.configureCa).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText('CA private key'), '-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----');
    await user.type(screen.getByLabelText('CA public key'), CA_KEY);
    await user.click(screen.getByRole('button', { name: 'Import key pair' }));
    await waitFor(() => expect(gateway.configureCa).toHaveBeenCalled());
    const input = vi.mocked(gateway.configureCa).mock.calls[0][2];
    expect(input.mode).toBe('import');
    if (input.mode === 'import') expect(JSON.stringify(input)).not.toContain('abc');
    await waitFor(() => expect(screen.getByLabelText('CA private key')).toHaveValue(''));
  });

  it('shows the CA public key with host snippets and deletes after typing the mount', async () => {
    const user = userEvent.setup();
    const { gateway } = renderPage('/engines/ssh');

    const ca = await screen.findByRole('region', { name: 'Signing CA' });
    expect(within(ca).getByText(CA_KEY)).toBeVisible();
    expect(await within(ca).findByText('SHA256:T4YFeMNAgckzBf0N9jNvyOVT+r430HJvSq9cmC+kPuw')).toBeVisible();
    expect(screen.getByText('TrustedUserCAKeys /etc/ssh/trusted-user-ca-keys.pem')).toBeVisible();
    expect(screen.getByText(`@cert-authority *.example.com ${CA_KEY}`)).toBeVisible();
    expect(screen.getByRole('link', { name: 'https://vault.example.test/v1/ssh/public_key' })).toBeVisible();

    const remove = screen.getByRole('button', { name: 'Delete signing CA' });
    expect(remove).toBeDisabled();
    await user.type(screen.getByLabelText('Type ssh to confirm'), 'ssh');
    await user.click(remove);
    await waitFor(() => expect(gateway.deleteCa).toHaveBeenCalledWith(expect.anything(), 'ssh'));
  });

  it('shows permission errors plainly', async () => {
    renderPage('/engines/ssh', fakeGateway({
      readCa: vi.fn(async () => {
        throw new VaultError('authorization', { status: 403 });
      }),
    }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('The signing CA could not be read');
    expect(alert).toHaveTextContent('Your Vault token does not allow this operation. Your token needs read on ssh/config/ca.');
  });

  it('lists roles, opens one by URL, and saves changes', async () => {
    const user = userEvent.setup();
    const { gateway } = renderPage('/engines/ssh/roles');

    await user.click(await screen.findByRole('button', { name: /^ops/ }));
    expect(location()).toHaveTextContent('/engines/ssh/roles/ops');
    const form = await screen.findByRole('form', { name: 'Role ops' });
    expect(within(form).getByLabelText('Allowed users')).toHaveValue('*');
    expect(within(form).getByLabelText('TTL')).toHaveValue('30m');
    expect(within(form).getByLabelText('Allow permit-pty')).toBeChecked();
    expect(within(form).getByLabelText('Grant permit-pty by default')).toBeChecked();

    await user.click(within(form).getByLabelText('Grant permit-port-forwarding by default'));
    await user.clear(within(form).getByLabelText('TTL'));
    await user.type(within(form).getByLabelText('TTL'), 'soon');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    expect(within(form).getByText('Use a duration such as 30m, 24h, or 720h.')).toBeVisible();
    expect(gateway.writeRole).not.toHaveBeenCalled();

    await user.clear(within(form).getByLabelText('TTL'));
    await user.type(within(form).getByLabelText('TTL'), '45m');
    await user.click(within(form).getByRole('button', { name: 'Save changes' }));
    await waitFor(() => expect(gateway.writeRole).toHaveBeenCalledWith(expect.anything(), 'ssh', 'ops', expect.objectContaining({
      keyType: 'ca',
      ttl: '45m',
      allowedExtensions: 'permit-pty,permit-port-forwarding',
      defaultExtensions: { 'permit-pty': '', 'permit-port-forwarding': '' },
    })));
  });

  it('creates an OTP role and requires a default user', async () => {
    const user = userEvent.setup();
    const { gateway } = renderPage('/engines/ssh/roles');

    await user.click(await screen.findByRole('button', { name: 'Create role' }));
    const form = screen.getByRole('form', { name: 'New role' });
    await user.type(within(form).getByLabelText('Role name'), 'jump');
    await user.click(within(form).getByRole('radio', { name: 'One-time passwords' }));
    await user.type(within(form).getByLabelText('CIDR list'), '10.0.0.0/8');
    await user.click(within(form).getByRole('button', { name: 'Create role' }));
    expect(within(form).getByText('OTP roles need a default user.')).toBeVisible();

    await user.type(within(form).getByLabelText('Default user'), 'ubuntu');
    await user.click(within(form).getByRole('button', { name: 'Create role' }));
    await waitFor(() => expect(gateway.writeRole).toHaveBeenCalledWith(expect.anything(), 'ssh', 'jump', {
      keyType: 'otp', defaultUser: 'ubuntu', allowedUsers: '', cidrList: '10.0.0.0/8', excludeCidrList: '', port: 22,
    }));
    await waitFor(() => expect(location()).toHaveTextContent('/engines/ssh/roles/jump'));
  });

  it('guides to the CA when there are no roles and no CA', async () => {
    renderPage('/engines/ssh/sign', fakeGateway({ readCa: vi.fn(async () => null), listRoles: vi.fn(async () => []) }));
    expect(await screen.findByRole('heading', { name: 'Configure the signing CA first' })).toBeVisible();
  });

  it('validates the public key, signs it, and shows the parsed certificate', async () => {
    const user = userEvent.setup();
    // The fixture was valid for 30 minutes in October 2026.
    vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2027-01-01T00:00:00Z'));
    const { gateway } = renderPage('/engines/ssh/sign/ops');

    const key = await screen.findByLabelText('Public key');
    await user.type(key, '-----BEGIN OPENSSH PRIVATE KEY-----');
    expect(screen.getByText(/This is a private key/)).toBeVisible();
    await user.clear(key);
    await user.click(key);
    await user.paste(userEd25519);
    expect(screen.getByText('ssh-ed25519')).toBeVisible();
    await user.type(screen.getByLabelText('Principals (login names)'), 'ubuntu, deploy');
    await user.type(screen.getByLabelText('Key ID'), 'alice@example');
    await user.click(screen.getByRole('radio', { name: 'Choose' }));
    await user.click(screen.getByRole('checkbox', { name: 'permit-port-forwarding' }));
    await user.click(screen.getByRole('button', { name: 'Sign public key' }));

    await waitFor(() => expect(gateway.signKey).toHaveBeenCalledWith(expect.anything(), 'ssh', expect.objectContaining({
      role: 'ops',
      certType: 'user',
      validPrincipals: 'ubuntu,deploy',
      keyId: 'alice@example',
      extensions: { 'permit-pty': '', 'permit-port-forwarding': '' },
    })));
    const result = await screen.findByRole('region', { name: 'Certificate signed' });
    expect(within(result).getByText('id_ed25519-cert.pub')).toBeVisible();
    expect(within(result).getByText('7743063489429775254')).toBeVisible();
    expect(within(result).getByText('alice@example')).toBeVisible();
    expect(within(result).getByText('deploy')).toBeVisible();
    expect(within(result).getByText('source-address=10.0.0.0/8')).toBeVisible();
    expect(within(result).getByText('Expired')).toBeVisible();
    expect(within(result).getByText(/ssh -i ~\/.ssh\/id_ed25519 -o CertificateFile=~\/.ssh\/id_ed25519-cert.pub deploy@host/)).toBeVisible();
    expect(location()).toHaveTextContent('/engines/ssh/sign/ops');
  });

  it('creates a masked OTP that stays out of the URL and query cache, and checks one', async () => {
    const user = userEvent.setup();
    const { gateway, client } = renderPage('/engines/ssh/otp');

    const ip = await screen.findByLabelText('Host IP address');
    await user.type(ip, '10.1.2');
    await user.click(screen.getByRole('button', { name: 'Create password' }));
    expect(screen.getByText(/Use an IPv4 address/)).toBeVisible();
    expect(gateway.createOtp).not.toHaveBeenCalled();
    await user.type(ip, '.3');
    await user.click(screen.getByRole('button', { name: 'Create password' }));

    const result = await screen.findByRole('region', { name: 'One-time password created' });
    expect(gateway.createOtp).toHaveBeenCalledWith(expect.anything(), 'ssh', 'otp1', { ip: '10.1.2.3', username: '' });
    expect(within(result).queryByText(OTP)).not.toBeInTheDocument();
    await user.click(within(result).getByRole('button', { name: 'Reveal' }));
    expect(within(result).getByText(OTP)).toBeVisible();
    expect(within(result).getByText('ssh/creds/otp1/abc')).toBeVisible();
    expect(location().textContent).not.toContain(OTP);
    expect(JSON.stringify(client.getQueryCache().getAll().map((query) => query.state.data))).not.toContain(OTP);

    await user.type(screen.getByLabelText('Password to check'), 'used-otp');
    await user.click(screen.getByRole('button', { name: 'Check password' }));
    expect(await screen.findByText('Unknown password')).toBeVisible();
    expect(vi.mocked(gateway.verifyOtp).mock.calls[0][2].reveal()).toBe('used-otp');
  });

  it('saves the zero-address allow list', async () => {
    const user = userEvent.setup();
    const { gateway } = renderPage('/engines/ssh/otp/otp1');
    const section = await screen.findByRole('region', { name: 'Roles allowed for any IP address' });
    await user.click(await within(section).findByRole('checkbox', { name: 'otp1' }));
    await user.click(within(section).getByRole('button', { name: 'Save' }));
    await waitFor(() => expect(gateway.writeZeroAddressRoles).toHaveBeenCalledWith(expect.anything(), 'ssh', ['otp1']));
  });
});
