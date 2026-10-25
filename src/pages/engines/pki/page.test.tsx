import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useNavigate, useParams } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  PkiPrivateKey,
  type PkiEngineGateway,
  type PkiIssuer,
  type PkiRole,
} from '@/domain/engines/pki/pki';
import { EMPTY_ROLE_INPUT } from '@/domain/engines/pki/pki-helpers';
import { VaultError } from '@/domain/vault/errors';
import { engineRoute } from '@/router/engine-route';
import { fakeEnginesGateway, renderWithEngines, testEngine } from '@/test/engines';
import PkiEnginePage from './page';
import { parsePkiRoute, pkiPath } from './pki-route';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../../../domain/engines/pki/fixtures');
const pem = (name: string) => readFileSync(join(fixtures, name), 'utf8');
const ROOT = pem('root-ec384.pem');
const LEAF = pem('leaf-ec256.pem');
const LONG = pem('long-rsa4096.pem');
const CRL = pem('intermediate.crl.pem');
const KEY_TEXT = '-----BEGIN EC PRIVATE KEY-----\nc2VjcmV0LWtleS1tYXRlcmlhbA==\n-----END EC PRIVATE KEY-----\n';

const MOUNT = 'pki/int';
const ROOT_ID = '84275f40-337f-9bbe-4ce8-313d41c71075';

const rootIssuer: PkiIssuer = {
  id: ROOT_ID,
  name: 'root-2026',
  keyId: 'k1',
  certificate: ROOT,
  caChain: [ROOT],
  usage: ['crl-signing', 'issuing-certificates', 'ocsp-signing', 'read-only'],
  leafNotAfterBehavior: 'err',
  revoked: false,
  issuingCertificates: [],
  crlDistributionPoints: [],
  ocspServers: [],
};

const webRole: PkiRole = {
  name: 'web',
  ...EMPTY_ROLE_INPUT,
  allowedDomains: ['example.com'],
  allowSubdomains: true,
  keyType: 'ec',
  keyBits: 256,
  ttlSeconds: 0,
  maxTtlSeconds: 2_592_000,
};

function fakeGateway(overrides: Partial<PkiEngineGateway> = {}): PkiEngineGateway {
  return {
    listIssuers: vi.fn(async () => [{ id: ROOT_ID, name: 'root-2026', isDefault: true, keyId: 'k1', serialNumber: '46:e2' }]),
    readIssuer: vi.fn(async () => rootIssuer),
    updateIssuer: vi.fn(async () => rootIssuer),
    deleteIssuer: vi.fn(async () => ['this was configured as the default issuer']),
    setDefaultIssuer: vi.fn(async () => undefined),
    readIssuerCrl: vi.fn(async () => CRL),
    importBundle: vi.fn(async () => ({ importedIssuers: ['i2'], importedKeys: ['k2'], existingIssuers: [], warnings: [] })),
    listKeys: vi.fn(async () => []),
    generateRoot: vi.fn(async () => ({
      certificate: ROOT, issuerId: ROOT_ID, issuerName: 'root-2026', keyId: 'k1', serialNumber: '46:e2',
      privateKey: new PkiPrivateKey(KEY_TEXT, 'ec'), warnings: ['Configure AIA URLs.'],
    })),
    generateIntermediate: vi.fn(async () => ({ csr: '-----BEGIN CERTIFICATE REQUEST-----\nMIIB\n-----END CERTIFICATE REQUEST-----\n', keyId: 'k3', warnings: [] })),
    setSignedIntermediate: vi.fn(async () => ({ importedIssuers: ['i3', ROOT_ID], importedKeys: [], existingIssuers: [], warnings: [] })),
    signIntermediate: vi.fn(async () => ({ certificate: LEAF, issuingCa: ROOT, caChain: [ROOT], serialNumber: '6b:92', warnings: [] })),
    listRoles: vi.fn(async () => ['web']),
    readRole: vi.fn(async () => webRole),
    saveRole: vi.fn(async () => undefined),
    deleteRole: vi.fn(async () => undefined),
    issueCertificate: vi.fn(async () => ({
      certificate: LEAF, issuingCa: ROOT, caChain: [ROOT], serialNumber: '6a:36', expiration: 1793201753,
      privateKey: new PkiPrivateKey(KEY_TEXT, 'ec'), warnings: [],
    })),
    signCertificate: vi.fn(async () => ({ certificate: LEAF, issuingCa: ROOT, caChain: [ROOT], serialNumber: '6a:36', warnings: [] })),
    listCertificates: vi.fn(async () => []),
    readCertificate: vi.fn(async (_session, _mount, serial: string) => ({ serialNumber: serial, certificate: LONG, revocationTime: 0 })),
    revokeCertificate: vi.fn(async () => ({ revocationTime: 1792942563, state: 'revoked' })),
    tidy: vi.fn(async () => ['Tidy operation successfully started.']),
    readTidyStatus: vi.fn(async () => ({ state: 'Finished', timeStarted: '2026-10-25T15:36:13Z', timeFinished: '2026-10-25T15:36:14Z', certStoreDeletedCount: 3, revokedCertDeletedCount: 1 })),
    readUrls: vi.fn(async () => ({ issuingCertificates: [], crlDistributionPoints: [], ocspServers: [] })),
    writeUrls: vi.fn(async () => undefined),
    readCrlConfig: vi.fn(async () => ({ expiry: '72h', disable: false, autoRebuild: false })),
    writeCrlConfig: vi.fn(async () => undefined),
    rotateCrl: vi.fn(async () => undefined),
    ...overrides,
  };
}

function Harness({ gateway }: { readonly gateway: PkiEngineGateway }) {
  const subPath = useParams()['*'] ?? '';
  const navigate = useNavigate();
  return (
    <PkiEnginePage
      engine={testEngine(MOUNT, 'pki')}
      subPath={subPath}
      navigateTo={(path) => navigate(engineRoute(MOUNT, path))}
      gateway={gateway}
    />
  );
}

function renderPage(subPath = '', gateway = fakeGateway(), engines = fakeEnginesGateway([testEngine(MOUNT, 'pki'), testEngine('pki-root', 'pki')])) {
  const result = renderWithEngines(<Harness gateway={gateway} />, {
    url: engineRoute(MOUNT, subPath),
    route: '/engines/pki/int/*',
    engines,
  });
  return { ...result, gateway };
}

function location() {
  return screen.getByLabelText('Current location');
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-25T16:00:00Z'));
  Object.defineProperty(URL, 'createObjectURL', { configurable: true, value: vi.fn(() => 'blob:pki-test') });
  Object.defineProperty(URL, 'revokeObjectURL', { configurable: true, value: vi.fn() });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('pki routes', () => {
  it('maps sub-paths to tabs and selections', () => {
    expect(parsePkiRoute('')).toEqual({ tab: 'overview' });
    expect(parsePkiRoute('roles/web')).toEqual({ tab: 'roles', id: 'web' });
    expect(parsePkiRoute('certificates/6a:36')).toEqual({ tab: 'certificates', id: '6a:36' });
    expect(parsePkiRoute('config/anything')).toEqual({ tab: 'config' });
    expect(parsePkiRoute('nope/x')).toEqual({ tab: 'overview' });
    expect(pkiPath('overview')).toBe('');
    expect(pkiPath('issuers', 'abc')).toBe('issuers/abc');
  });
});

describe('PkiEnginePage setup', () => {
  it('guides an empty mount to a root CA and shows an exported key only once, masked', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway({ listIssuers: vi.fn(async () => []) });
    renderPage('', gateway);

    expect(await screen.findByRole('heading', { name: 'Set up a certificate authority' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Create root CA' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create a root CA' });
    await user.click(within(dialog).getByRole('radio', { name: /Export once/ }));
    await user.click(within(dialog).getByRole('button', { name: 'Create root CA' }));
    expect(within(dialog).getByText('Enter a common name.')).toBeVisible();
    expect(gateway.generateRoot).not.toHaveBeenCalled();

    await user.type(within(dialog).getByLabelText('Common name'), 'Example Root CA');
    await user.type(within(dialog).getByLabelText('Issuer name'), 'root-2026');
    await user.selectOptions(within(dialog).getByLabelText('Key type'), 'rsa');
    await user.selectOptions(within(dialog).getByLabelText('Key size'), '4096');
    await user.click(within(dialog).getByRole('button', { name: 'Create root CA' }));
    await waitFor(() => expect(gateway.generateRoot).toHaveBeenCalledWith(expect.anything(), MOUNT, expect.objectContaining({
      exportKey: 'exported', commonName: 'Example Root CA', issuerName: 'root-2026', keyType: 'rsa', keyBits: 4096, ttl: '87600h',
    })));

    const result = await screen.findByRole('dialog', { name: 'Root CA created' });
    expect(within(result).getByText('Vault shows this private key only once.')).toBeVisible();
    expect(within(result).getByText('Configure AIA URLs.')).toBeVisible();
    expect(document.body).not.toHaveTextContent('c2VjcmV0LWtleS1tYXRlcmlhbA');
    expect(within(result).getAllByText('C=US, O=Example Co, CN=Example Root CA')).toHaveLength(2);

    // Closing before saving the key asks first.
    await user.click(within(result).getByRole('button', { name: 'Done' }));
    const confirm = await screen.findByRole('dialog', { name: 'Close without saving the key' });
    await user.click(within(confirm).getByRole('button', { name: 'Keep open' }));
    // userEvent installs its own clipboard; replace it after setup to observe writes.
    const writeText = vi.fn(async (_value: string) => undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    await user.click(within(result).getByRole('button', { name: 'Copy private key' }));
    expect(writeText).toHaveBeenCalledWith(KEY_TEXT);
    await user.click(within(result).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(location()).toHaveTextContent(`/engines/pki/int/issuers/${ROOT_ID}`));
    expect(window.location.href).not.toContain('PRIVATE');
  });

  it('creates an intermediate, signs it on another PKI mount, and installs the chain', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway({ listIssuers: vi.fn(async () => []) });
    renderPage('', gateway);

    await user.click(await screen.findByRole('button', { name: 'Create intermediate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Create an intermediate CA' });
    await user.type(within(dialog).getByLabelText('Common name'), 'Example Intermediate');
    await user.click(within(dialog).getByRole('button', { name: 'Create signing request' }));

    const signDialog = await screen.findByRole('dialog', { name: 'Sign the intermediate' });
    expect(within(signDialog).getByText(/BEGIN CERTIFICATE REQUEST/)).toBeVisible();
    await user.click(within(signDialog).getByRole('button', { name: 'Sign and install' }));
    expect(within(signDialog).getByText('Choose the mount that should sign this request.')).toBeVisible();
    await user.selectOptions(await within(signDialog).findByLabelText('Signing mount'), 'pki-root');
    await user.type(within(signDialog).getByLabelText('Max path length'), '0');
    await user.click(within(signDialog).getByRole('button', { name: 'Sign and install' }));

    await waitFor(() => expect(gateway.signIntermediate).toHaveBeenCalledWith(expect.anything(), 'pki-root', expect.objectContaining({
      commonName: 'Example Intermediate', ttl: '43800h', maxPathLength: 0,
    })));
    await waitFor(() => expect(gateway.setSignedIntermediate).toHaveBeenCalled());
    const bundle = vi.mocked(gateway.setSignedIntermediate).mock.calls[0][2];
    expect(bundle.match(/BEGIN CERTIFICATE/g)).toHaveLength(2);
    expect(await screen.findByRole('dialog', { name: 'Intermediate CA installed' })).toHaveTextContent('2 issuers were imported');
  });

  it('explains missing permissions plainly', async () => {
    renderPage('issuers', fakeGateway({ listIssuers: vi.fn(async () => { throw new VaultError('authorization', { status: 403 }); }) }));
    const alert = await screen.findByRole('alert');
    expect(alert).toHaveTextContent('Issuers could not be listed');
    expect(alert).toHaveTextContent('Your Vault token does not allow this operation.');
    expect(alert).toHaveTextContent('Your token needs list on pki/int/issuers.');
  });

  it('imports a CA bundle and clears the pasted key', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    renderPage('issuers', gateway);
    await user.click(await screen.findByRole('button', { name: /Import/ }));
    const dialog = await screen.findByRole('dialog', { name: 'Import a CA' });
    const field = within(dialog).getByLabelText('PEM bundle');
    await user.click(field);
    await user.paste(`${ROOT}${KEY_TEXT}`);
    expect(within(dialog).getByText(/includes a private key/)).toBeVisible();
    await user.click(within(dialog).getByRole('button', { name: 'Import' }));
    await waitFor(() => expect(gateway.importBundle).toHaveBeenCalledWith(expect.anything(), MOUNT, `${ROOT}${KEY_TEXT}`));
    expect(await within(dialog).findByText(/Imported 1 issuer and 1 key/)).toBeVisible();
  });
});

describe('PkiEnginePage issuers', () => {
  it('shows parsed issuer details, the chain, and the CRL, and saves settings', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    renderPage(`issuers/${ROOT_ID}`, gateway);

    expect(await screen.findByRole('heading', { name: 'Example Root CA' })).toBeVisible();
    expect(screen.getAllByText('Default').length).toBeGreaterThan(0);
    expect(screen.getByText('root.example.com, 10.0.0.1')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Load CRL' }));
    expect(await screen.findByText('Revoked entries')).toBeVisible();

    const settings = screen.getByRole('form', { name: 'Issuer settings' });
    await user.click(within(settings).getByLabelText('Sign OCSP responses'));
    await user.selectOptions(within(settings).getByLabelText('When a request outlives this issuer'), 'truncate');
    await user.click(within(settings).getByRole('button', { name: 'Save settings' }));
    await waitFor(() => expect(gateway.updateIssuer).toHaveBeenCalledWith(expect.anything(), MOUNT, ROOT_ID, {
      name: 'root-2026',
      usage: ['crl-signing', 'issuing-certificates', 'read-only'],
      leafNotAfterBehavior: 'truncate',
    }));
  });

  it('deletes an issuer only after its name is typed', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    renderPage(`issuers/${ROOT_ID}`, gateway);
    const remove = await screen.findByRole('button', { name: 'Delete issuer' });
    expect(remove).toBeDisabled();
    await user.type(screen.getByLabelText('Type root-2026 to confirm'), 'root-2026');
    await user.click(remove);
    await waitFor(() => expect(gateway.deleteIssuer).toHaveBeenCalledWith(expect.anything(), MOUNT, ROOT_ID));
    await waitFor(() => expect(location()).toHaveTextContent(/\/engines\/pki\/int\/issuers$/));
    expect(await screen.findByText('this was configured as the default issuer')).toBeVisible();
  });

  it('makes a non-default issuer the default', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway({
      listIssuers: vi.fn(async () => [{ id: ROOT_ID, name: 'root-2026', isDefault: false, keyId: 'k1', serialNumber: '46:e2' }]),
    });
    renderPage(`issuers/${ROOT_ID}`, gateway);
    await user.click(await screen.findByRole('button', { name: 'Make default' }));
    await waitFor(() => expect(gateway.setDefaultIssuer).toHaveBeenCalledWith(expect.anything(), MOUNT, ROOT_ID));
  });
});

describe('PkiEnginePage roles', () => {
  it('lists roles and creates one with validated TTLs', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    renderPage('roles', gateway);

    expect(await screen.findByText('example.com (subdomains)')).toBeVisible();
    await user.click(screen.getAllByRole('button', { name: 'Create role' })[0]);
    const dialog = await screen.findByRole('dialog', { name: 'Create role' });
    await user.type(within(dialog).getByLabelText('Role name'), 'web');
    await user.type(within(dialog).getByLabelText('Max TTL'), 'forever');
    await user.click(within(dialog).getByRole('button', { name: 'Create role' }));
    expect(within(dialog).getByText('A role with this name already exists.')).toBeVisible();
    expect(within(dialog).getByText('Use a duration such as 30m, 24h, or 720h.')).toBeVisible();

    await user.clear(within(dialog).getByLabelText('Role name'));
    await user.type(within(dialog).getByLabelText('Role name'), 'api');
    await user.clear(within(dialog).getByLabelText('Max TTL'));
    await user.type(within(dialog).getByLabelText('Max TTL'), '720h');
    await user.type(within(dialog).getByLabelText('Allowed domains'), 'api.example.com');
    await user.click(within(dialog).getByLabelText('Bare domains'));
    await user.click(within(dialog).getByRole('button', { name: 'Create role' }));
    await waitFor(() => expect(gateway.saveRole).toHaveBeenCalledWith(expect.anything(), MOUNT, 'api', expect.objectContaining({
      allowedDomains: ['api.example.com'], allowBareDomains: true, maxTtl: '720h', keyType: 'rsa', keyBits: 2048,
    }), 'create'));
    await waitFor(() => expect(location()).toHaveTextContent('/engines/pki/int/roles/api'));
  });

  it('issues a certificate, shows the parsed result, and keeps the key masked', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    renderPage('roles/web', gateway);

    await user.click(await screen.findByRole('button', { name: 'Issue certificate' }));
    const dialog = await screen.findByRole('dialog', { name: 'Issue certificate' });
    await user.type(within(dialog).getByLabelText('IP addresses'), 'not-an-ip');
    await user.click(within(dialog).getByRole('button', { name: 'Issue certificate' }));
    expect(within(dialog).getByText('Enter a common name.')).toBeVisible();
    expect(within(dialog).getByText('not-an-ip is not an IP address.')).toBeVisible();

    await user.type(within(dialog).getByLabelText('Common name'), 'app.example.com');
    await user.clear(within(dialog).getByLabelText('IP addresses'));
    await user.type(within(dialog).getByLabelText('TTL'), '72h');
    await user.selectOptions(within(dialog).getByLabelText('Format'), 'pem_bundle');
    await user.click(within(dialog).getByRole('button', { name: 'Issue certificate' }));
    await waitFor(() => expect(gateway.issueCertificate).toHaveBeenCalledWith(expect.anything(), MOUNT, 'web', expect.objectContaining({
      commonName: 'app.example.com', ttl: '72h', format: 'pem_bundle', privateKeyFormat: '',
    })));

    const result = await screen.findByRole('dialog', { name: 'Certificate issued' });
    expect(within(result).getByText('api.example.com, app.example.com, 192.168.1.10')).toBeVisible();
    expect(within(result).getByText('Expires in 2d')).toBeVisible();
    expect(document.body).not.toHaveTextContent('c2VjcmV0LWtleS1tYXRlcmlhbA');
    await user.click(within(result).getByRole('button', { name: 'Reveal' }));
    expect(within(result).getByText(/c2VjcmV0LWtleS1tYXRlcmlhbA/)).toBeVisible();
    await user.click(within(result).getByRole('button', { name: 'Download bundle' }));
    expect(URL.createObjectURL).toHaveBeenCalled();
    await user.click(within(result).getByRole('button', { name: 'Done' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Certificate issued' })).not.toBeInTheDocument());
  });

  it('shows Vault reasons when signing a CSR is rejected', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway({ signCertificate: vi.fn(async () => { throw new VaultError('invalid-request', { reason: 'common name evil.com not allowed by this role' }); }) });
    renderPage('roles/web', gateway);
    await user.click(await screen.findByRole('button', { name: 'Sign CSR' }));
    const dialog = await screen.findByRole('dialog', { name: 'Sign request' });
    await user.click(within(dialog).getByLabelText('Certificate signing request (PEM)'));
    await user.paste('-----BEGIN CERTIFICATE REQUEST-----\nMIIB\n-----END CERTIFICATE REQUEST-----');
    await user.click(within(dialog).getByRole('button', { name: 'Sign request' }));
    expect(await within(dialog).findByText('common name evil.com not allowed by this role')).toBeVisible();
  });

  it('edits and deletes a role', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    renderPage('roles/web', gateway);
    await user.click(await screen.findByRole('button', { name: 'Edit' }));
    const dialog = await screen.findByRole('dialog', { name: 'Edit web' });
    expect(within(dialog).getByLabelText('Max TTL')).toHaveValue('720h');
    await user.click(within(dialog).getByRole('button', { name: 'Save role' }));
    await waitFor(() => expect(gateway.saveRole).toHaveBeenCalledWith(expect.anything(), MOUNT, 'web', expect.objectContaining({ maxTtl: '720h' }), 'update'));

    await user.click(screen.getByRole('button', { name: 'Delete' }));
    await user.click(within(await screen.findByRole('dialog', { name: 'Delete role' })).getByRole('button', { name: 'Delete role' }));
    await waitFor(() => expect(gateway.deleteRole).toHaveBeenCalledWith(expect.anything(), MOUNT, 'web'));
    await waitFor(() => expect(location()).toHaveTextContent(/\/roles$/));
  });
});

describe('PkiEnginePage certificates', () => {
  const serials = Array.from({ length: 30 }, (_, index) => `aa:${index.toString(16).padStart(2, '0')}`);

  it('loads details one page at a time, searches serials, and revokes after confirmation', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway({ listCertificates: vi.fn(async () => serials) });
    renderPage('certificates', gateway);

    expect(await screen.findByText('1–25 of 30')).toBeVisible();
    await waitFor(() => expect(gateway.readCertificate).toHaveBeenCalledTimes(25));
    expect((await screen.findAllByText('long.example.org')).length).toBeGreaterThan(0);
    await user.click(screen.getByRole('button', { name: 'Next' }));
    expect(await screen.findByText('26–30 of 30')).toBeVisible();
    await waitFor(() => expect(gateway.readCertificate).toHaveBeenCalledTimes(30));

    await user.type(screen.getByLabelText('Search certificates'), 'aa1d');
    expect(screen.getByRole('button', { name: 'aa:1d' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'aa:00' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Revoke aa:1d' }));
    const confirm = await screen.findByRole('dialog', { name: 'Revoke certificate' });
    await user.click(within(confirm).getByRole('button', { name: 'Revoke' }));
    await waitFor(() => expect(gateway.revokeCertificate).toHaveBeenCalledWith(expect.anything(), MOUNT, 'aa:1d'));

    await user.clear(screen.getByLabelText('Search certificates'));
    await user.type(screen.getByLabelText('Search certificates'), 'LONG.example');
    expect(screen.getByText('1–25 of 30')).toBeVisible();
  });

  it('opens a certificate and shows its revocation', async () => {
    const gateway = fakeGateway({
      readCertificate: vi.fn(async (_session, _mount, serial: string) => ({
        serialNumber: serial, certificate: LEAF, revocationTime: 1792942563, revokedAt: '2026-10-25T15:36:03Z',
      })),
    });
    renderPage('certificates/6a:36', gateway);
    expect(await screen.findByRole('heading', { name: 'app.example.com' })).toBeVisible();
    expect(screen.getAllByText('Revoked').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  it('explains an empty certificate store', async () => {
    renderPage('certificates');
    expect(await screen.findByRole('heading', { name: 'No stored certificates' })).toBeVisible();
  });
});

describe('PkiEnginePage tidy and config', () => {
  it('runs tidy and saves URL and CRL settings', async () => {
    const user = userEvent.setup();
    const gateway = fakeGateway();
    renderPage('config', gateway);

    expect(await screen.findByText('Certificates removed')).toBeVisible();
    await user.click(screen.getByLabelText('Expired issuers'));
    await user.click(screen.getByRole('button', { name: 'Run tidy' }));
    await waitFor(() => expect(gateway.tidy).toHaveBeenCalledWith(expect.anything(), MOUNT, {
      tidyCertStore: true, tidyRevokedCerts: true, tidyExpiredIssuers: true, safetyBuffer: '72h',
    }));

    await user.type(await screen.findByLabelText('CRL distribution points'), 'https://vault.example.com/v1/pki/int/crl');
    await user.click(screen.getByRole('button', { name: 'Save URLs' }));
    await waitFor(() => expect(gateway.writeUrls).toHaveBeenCalledWith(expect.anything(), MOUNT, {
      issuingCertificates: [], crlDistributionPoints: ['https://vault.example.com/v1/pki/int/crl'], ocspServers: [],
    }));

    await user.click(await screen.findByLabelText('Rebuild automatically'));
    await user.click(screen.getByRole('button', { name: 'Save CRL settings' }));
    await waitFor(() => expect(gateway.writeCrlConfig).toHaveBeenCalledWith(expect.anything(), MOUNT, { expiry: '72h', disable: false, autoRebuild: true }));
    await user.click(screen.getByRole('button', { name: 'Rebuild CRL now' }));
    await waitFor(() => expect(gateway.rotateCrl).toHaveBeenCalled());
  });
});

describe('PkiEnginePage overview', () => {
  it('summarizes the default issuer and counts and switches tabs through the URL', async () => {
    const user = userEvent.setup();
    renderPage('', fakeGateway({ listCertificates: vi.fn(async () => ['aa:01', 'aa:02']) }));
    expect(await screen.findByText('Default issuer')).toBeVisible();
    expect(await screen.findByRole('heading', { name: 'Example Root CA' })).toBeVisible();
    await user.click(await screen.findByRole('button', { name: /^Certificates\s*2$/ }));
    expect(location()).toHaveTextContent('/engines/pki/int/certificates');
    await user.click(screen.getByRole('button', { name: /Tidy & config/ }));
    expect(location()).toHaveTextContent('/engines/pki/int/config');
  });
});
