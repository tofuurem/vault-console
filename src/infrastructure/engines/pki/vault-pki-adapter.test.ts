import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it, vi } from 'vitest';

import { PkiPrivateKey } from '@/domain/engines/pki/pki';
import { EMPTY_ROLE_INPUT } from '@/domain/engines/pki/pki-helpers';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { VaultHttpClient, type VaultFetch } from '../../vault/http/vault-http-client';
import { VaultPkiAdapter } from './vault-pki-adapter';

const session = { serverUrl: 'https://vault.example.test', token: vaultToken('hvs.op'), authMethod: 'token' as const };
const fixtures = join(dirname(fileURLToPath(import.meta.url)), '../../../domain/engines/pki/fixtures');
const LEAF = readFileSync(join(fixtures, 'leaf-ec256.pem'), 'utf8');
const INTERMEDIATE_BUNDLE = readFileSync(join(fixtures, 'intermediate-rsa2048.pem'), 'utf8');
const KEY = '-----BEGIN EC PRIVATE KEY-----\nMHcCAQEEIA==\n-----END EC PRIVATE KEY-----\n';

function json(body: unknown, status = 200) {
  return status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(...responses: Response[]) {
  const fetchRequest = vi.fn<VaultFetch>();
  responses.forEach((response) => fetchRequest.mockResolvedValueOnce(response));
  return { fetchRequest, adapter: new VaultPkiAdapter(new VaultHttpClient(fetchRequest)) };
}

function call(fetchRequest: ReturnType<typeof setup>['fetchRequest'], index: number) {
  const [url, init] = fetchRequest.mock.calls[index];
  return {
    url: String(url),
    method: init?.method,
    body: init?.body === undefined ? undefined : JSON.parse(String(init.body)) as Record<string, unknown>,
  };
}

describe('VaultPkiAdapter issuers', () => {
  it('lists issuers with key_info under a nested mount and treats 404 as empty', async () => {
    const { adapter, fetchRequest } = setup(
      json({ data: {
        keys: ['a1', 'b2'],
        key_info: {
          a1: { is_default: true, issuer_name: 'root-2026', key_id: 'k1', serial_number: '46:e2' },
          b2: { is_default: false, issuer_name: '', key_id: '', serial_number: '6b:92' },
        },
      } }),
      json({ errors: [] }, 404),
    );
    await expect(adapter.listIssuers(session, 'pki/int')).resolves.toEqual([
      { id: 'a1', name: 'root-2026', isDefault: true, keyId: 'k1', serialNumber: '46:e2' },
      { id: 'b2', name: '', isDefault: false, keyId: '', serialNumber: '6b:92' },
    ]);
    expect(call(fetchRequest, 0).url).toBe('https://vault.example.test/v1/pki/int/issuers?list=true');
    await expect(adapter.listIssuers(session, 'pki')).resolves.toEqual([]);
  });

  it('reads an issuer and rejects malformed fields', async () => {
    const { adapter } = setup(
      json({ data: {
        issuer_id: 'a1', issuer_name: 'root', key_id: 'k1', certificate: LEAF, ca_chain: [LEAF],
        usage: 'crl-signing,issuing-certificates,read-only', leaf_not_after_behavior: 'truncate', revoked: false,
        issuing_certificates: ['http://v/ca'], crl_distribution_points: [], ocsp_servers: null, manual_chain: null,
      } }),
      json({ data: { issuer_id: 42 } }),
    );
    await expect(adapter.readIssuer(session, 'pki', 'root')).resolves.toMatchObject({
      id: 'a1',
      usage: ['crl-signing', 'issuing-certificates', 'read-only'],
      leafNotAfterBehavior: 'truncate',
      issuingCertificates: ['http://v/ca'],
      ocspServers: [],
    });
    await expect(adapter.readIssuer(session, 'pki', 'root')).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('updates an issuer without dropping fields Vault would reset', async () => {
    const current = {
      issuer_id: 'a1', issuer_name: 'old', certificate: LEAF, usage: 'read-only',
      leaf_not_after_behavior: 'err', issuing_certificates: ['http://v/ca'], manual_chain: null,
      enable_aia_url_templating: false, revocation_signature_algorithm: '',
    };
    const { adapter, fetchRequest } = setup(json({ data: current }), json({ data: { ...current, issuer_name: 'new' } }));
    await adapter.updateIssuer(session, 'pki', 'old', { name: ' new ', usage: ['read-only', 'issuing-certificates'], leafNotAfterBehavior: 'truncate' });
    const write = call(fetchRequest, 1);
    expect(write).toMatchObject({ url: 'https://vault.example.test/v1/pki/issuer/old', method: 'POST' });
    expect(write.body).toEqual({
      issuer_name: 'new',
      usage: 'read-only,issuing-certificates',
      leaf_not_after_behavior: 'truncate',
      issuing_certificates: ['http://v/ca'],
      enable_aia_url_templating: false,
      revocation_signature_algorithm: '',
    });
  });

  it('sets the default, deletes with warnings, reads the CRL, and imports bundles', async () => {
    const { adapter, fetchRequest } = setup(
      json({ data: { default: 'a1' } }),
      json({ data: null, warnings: ['this was configured as the default issuer'] }),
      json({ data: { crl: '-----BEGIN X509 CRL-----' } }),
      json({ data: { imported_issuers: ['c3'], imported_keys: null, existing_issuers: null }, warnings: null }),
    );
    await adapter.setDefaultIssuer(session, 'pki', 'a1');
    expect(call(fetchRequest, 0)).toMatchObject({ url: 'https://vault.example.test/v1/pki/config/issuers', body: { default: 'a1' } });
    await expect(adapter.deleteIssuer(session, 'pki', 'a1')).resolves.toEqual(['this was configured as the default issuer']);
    expect(call(fetchRequest, 1).method).toBe('DELETE');
    await expect(adapter.readIssuerCrl(session, 'pki', 'a1')).resolves.toBe('-----BEGIN X509 CRL-----');
    await expect(adapter.importBundle(session, 'pki', ` ${LEAF} `)).resolves.toEqual({
      importedIssuers: ['c3'], importedKeys: [], existingIssuers: [], warnings: [],
    });
    expect(call(fetchRequest, 3).body).toEqual({ pem_bundle: LEAF.trim() });
  });

  it('rejects references that would change the request path', async () => {
    const { adapter, fetchRequest } = setup();
    await expect(adapter.readIssuer(session, 'pki', '../sys')).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(adapter.readCertificate(session, 'pki', '')).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(adapter.listRoles(session, '../sys')).rejects.toMatchObject({ code: 'invalid-request' });
    expect(fetchRequest).not.toHaveBeenCalled();
  });
});

describe('VaultPkiAdapter CA generation', () => {
  it('generates an exported root and keeps the private key out of JSON', async () => {
    const { adapter, fetchRequest } = setup(json({ data: {
      certificate: LEAF, issuing_ca: LEAF, issuer_id: 'a1', issuer_name: 'root', key_id: 'k1',
      serial_number: '46:e2', expiration: 2108302493, private_key: KEY, private_key_type: 'ec',
    }, warnings: ['configure AIA'] }));
    const result = await adapter.generateRoot(session, 'pki', {
      exportKey: 'exported', commonName: ' Example Root ', issuerName: 'root', keyType: 'ed25519', keyBits: 4096,
      ttl: '87600h', organization: 'Example Co', ou: '', country: 'US', altNames: 'a.example.com, b.example.com',
      ipSans: '10.0.0.1', maxPathLength: 1,
    });
    expect(call(fetchRequest, 0)).toMatchObject({ url: 'https://vault.example.test/v1/pki/root/generate/exported', method: 'POST' });
    expect(call(fetchRequest, 0).body).toEqual({
      common_name: 'Example Root', issuer_name: 'root', key_type: 'ed25519', key_bits: 0, ttl: '87600h',
      organization: 'Example Co', country: 'US', alt_names: 'a.example.com,b.example.com', ip_sans: '10.0.0.1', max_path_length: 1,
    });
    expect(result.privateKey).toBeInstanceOf(PkiPrivateKey);
    expect(result.privateKey?.reveal()).toBe(KEY);
    expect(JSON.stringify(result)).not.toContain('PRIVATE KEY');
    expect(result.warnings).toEqual(['configure AIA']);
  });

  it('generates an intermediate CSR, signs it on another mount, and imports the chain', async () => {
    const { adapter, fetchRequest } = setup(
      json({ data: { csr: '-----BEGIN CERTIFICATE REQUEST-----', key_id: 'k2', private_key: null } }),
      json({ data: {
        certificate: INTERMEDIATE_BUNDLE, issuing_ca: LEAF, ca_chain: [LEAF], serial_number: '6b:92', expiration: '1950622500',
      } }),
      json({ data: { imported_issuers: ['i1', 'r1'], imported_keys: null, mapping: {} } }),
    );
    const csr = await adapter.generateIntermediate(session, 'pki/int', { exportKey: 'internal', commonName: 'Int', keyType: 'rsa', keyBits: 2048 });
    expect(csr).toEqual({ csr: '-----BEGIN CERTIFICATE REQUEST-----', keyId: 'k2', privateKey: undefined, warnings: [] });
    expect(call(fetchRequest, 0).url).toBe('https://vault.example.test/v1/pki/int/intermediate/generate/internal');

    const signed = await adapter.signIntermediate(session, 'pki', { csr: csr.csr, commonName: 'Int', ttl: '43800h', issuerRef: 'root', maxPathLength: 0 });
    expect(call(fetchRequest, 1)).toMatchObject({
      url: 'https://vault.example.test/v1/pki/issuer/root/sign-intermediate',
      body: { csr: csr.csr, common_name: 'Int', ttl: '43800h', max_path_length: 0, format: 'pem_bundle' },
    });
    // The bundle is split so `certificate` holds only the intermediate.
    expect(signed.certificate.match(/BEGIN CERTIFICATE/g)).toHaveLength(1);
    expect(signed.expiration).toBe(1950622500);

    await expect(adapter.setSignedIntermediate(session, 'pki/int', signed.certificate)).resolves.toMatchObject({ importedIssuers: ['i1', 'r1'] });
    expect(call(fetchRequest, 2).url).toBe('https://vault.example.test/v1/pki/int/intermediate/set-signed');
  });

  it('uses the default issuer when no reference is given', async () => {
    const { adapter, fetchRequest } = setup(json({ data: { certificate: LEAF, serial_number: '1' } }));
    await adapter.signIntermediate(session, 'pki', { csr: 'csr' });
    expect(call(fetchRequest, 0).url).toBe('https://vault.example.test/v1/pki/root/sign-intermediate');
  });
});

describe('VaultPkiAdapter roles and issuing', () => {
  const vaultRole = {
    issuer_ref: 'default', allowed_domains: ['example.com'], allow_subdomains: true, allow_bare_domains: false,
    allow_glob_domains: false, allow_any_name: false, allow_localhost: true, allow_ip_sans: true, server_flag: true,
    client_flag: false, key_type: 'ec', key_bits: 256, ttl: 0, max_ttl: 2592000, no_store: false, require_cn: true,
    ext_key_usage: [], organization: [], ou: null, allowed_uri_sans: ['spiffe://x/*'],
  };

  it('lists and reads roles', async () => {
    const { adapter } = setup(json({ data: { keys: ['web'] } }), json({ data: vaultRole }), json({ data: { ...vaultRole, key_type: 'dsa' } }));
    await expect(adapter.listRoles(session, 'pki')).resolves.toEqual(['web']);
    await expect(adapter.readRole(session, 'pki', 'web')).resolves.toMatchObject({
      name: 'web', keyType: 'ec', keyBits: 256, maxTtlSeconds: 2592000, ttlSeconds: 0, ou: [], clientFlag: false,
    });
    await expect(adapter.readRole(session, 'pki', 'web')).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('creates roles from form input and keeps unknown fields on update', async () => {
    const { adapter, fetchRequest } = setup(json(null, 204), json({ data: vaultRole }), json(null, 204));
    const input = { ...EMPTY_ROLE_INPUT, allowedDomains: ['example.com'], keyType: 'ed25519' as const, keyBits: 2048, ttl: '', maxTtl: '720h' };
    await adapter.saveRole(session, 'pki', 'web', input, 'create');
    expect(call(fetchRequest, 0).body).toMatchObject({ key_type: 'ed25519', key_bits: 0, ttl: '0', max_ttl: '720h', issuer_ref: 'default' });
    expect(call(fetchRequest, 0).body).not.toHaveProperty('allowed_uri_sans');

    await adapter.saveRole(session, 'pki', 'web', { ...input, keyType: 'rsa', keyBits: 4096 }, 'update');
    expect(call(fetchRequest, 1).method).toBe('GET');
    expect(call(fetchRequest, 2).body).toMatchObject({ key_type: 'rsa', key_bits: 4096, allowed_uri_sans: ['spiffe://x/*'] });
  });

  it('issues a certificate, splits bundles, and wraps the private key', async () => {
    const bundle = `${KEY}${LEAF}${INTERMEDIATE_BUNDLE}`;
    const { adapter, fetchRequest } = setup(json({ data: {
      certificate: bundle, issuing_ca: LEAF, ca_chain: [LEAF], private_key: KEY, private_key_type: 'ec',
      serial_number: '6a:36', expiration: 1793201753,
    } }));
    const result = await adapter.issueCertificate(session, 'pki', 'web', {
      commonName: 'app.example.com', altNames: 'api.example.com', ipSans: '', ttl: '72h', format: 'pem_bundle', privateKeyFormat: 'pkcs8',
    });
    expect(call(fetchRequest, 0)).toMatchObject({
      url: 'https://vault.example.test/v1/pki/issue/web',
      body: { common_name: 'app.example.com', alt_names: 'api.example.com', ttl: '72h', format: 'pem_bundle', private_key_format: 'pkcs8' },
    });
    expect(call(fetchRequest, 0).body).not.toHaveProperty('ip_sans');
    expect(result.certificate).not.toContain('PRIVATE KEY');
    expect(result.certificate).toBe(LEAF.endsWith('\n') ? LEAF : `${LEAF}\n`);
    expect(String(result.privateKey)).toBe('[REDACTED]');
    expect(result.expiration).toBe(1793201753);
  });

  it('raises Vault reasons from 400 responses without PEM data', async () => {
    const { adapter } = setup(
      json({ errors: ['common name evil.com not allowed by this role'] }, 400),
      json({ errors: ['permission denied'] }, 403),
    );
    const failure = adapter.signCertificate(session, 'pki', 'web', { csr: 'csr', format: 'pem' });
    await expect(failure).rejects.toMatchObject({ code: 'invalid-request', reason: 'common name evil.com not allowed by this role' });
    await expect(adapter.deleteRole(session, 'pki', 'web')).rejects.toMatchObject({ code: 'authorization' });
  });
});

describe('VaultPkiAdapter certificates and maintenance', () => {
  it('lists, reads, and revokes certificates', async () => {
    const { adapter, fetchRequest } = setup(
      json({ data: { keys: ['6a:36'] } }),
      json({ data: { certificate: LEAF, revocation_time: 1792942563, revocation_time_rfc3339: '2026-10-25T15:36:03Z', issuer_id: 'i1' } }),
      json({ data: { revocation_time: 1792942563, state: 'revoked' } }),
    );
    await expect(adapter.listCertificates(session, 'pki')).resolves.toEqual(['6a:36']);
    await expect(adapter.readCertificate(session, 'pki', '6a:36')).resolves.toEqual({
      serialNumber: '6a:36', certificate: LEAF, revocationTime: 1792942563, revokedAt: '2026-10-25T15:36:03Z', issuerId: 'i1',
    });
    expect(call(fetchRequest, 1).url).toBe('https://vault.example.test/v1/pki/cert/6a%3A36');
    await expect(adapter.revokeCertificate(session, 'pki', '6a:36')).resolves.toEqual({ revocationTime: 1792942563, state: 'revoked' });
    expect(call(fetchRequest, 2).body).toEqual({ serial_number: '6a:36' });
  });

  it('starts tidy and reads its status', async () => {
    const { adapter, fetchRequest } = setup(
      json({ data: null, warnings: ['Tidy operation successfully started.'] }, 202),
      json({ data: { state: 'Finished', error: null, time_started: '2026-10-25T15:36:13Z', cert_store_deleted_count: 2, revoked_cert_deleted_count: 0 } }),
    );
    await expect(adapter.tidy(session, 'pki', { tidyCertStore: true, tidyRevokedCerts: false, tidyExpiredIssuers: true, safetyBuffer: '' }))
      .resolves.toEqual(['Tidy operation successfully started.']);
    expect(call(fetchRequest, 0).body).toEqual({ tidy_cert_store: true, tidy_revoked_certs: false, tidy_expired_issuers: true });
    await expect(adapter.readTidyStatus(session, 'pki')).resolves.toMatchObject({ state: 'Finished', certStoreDeletedCount: 2, error: undefined });
  });

  it('reads and writes URL and CRL settings and rotates the CRL with GET', async () => {
    const { adapter, fetchRequest } = setup(
      json({ data: { issuing_certificates: ['http://v/ca'], crl_distribution_points: [], ocsp_servers: [] } }),
      json(null, 204),
      json({ data: { expiry: '72h', disable: false, auto_rebuild: true, ocsp_disable: false } }),
      json(null, 204),
      json({ data: { success: true } }),
    );
    await expect(adapter.readUrls(session, 'pki')).resolves.toEqual({ issuingCertificates: ['http://v/ca'], crlDistributionPoints: [], ocspServers: [] });
    await adapter.writeUrls(session, 'pki', { issuingCertificates: [], crlDistributionPoints: ['http://v/crl'], ocspServers: [] });
    expect(call(fetchRequest, 1).body).toEqual({ issuing_certificates: [], crl_distribution_points: ['http://v/crl'], ocsp_servers: [] });
    await expect(adapter.readCrlConfig(session, 'pki')).resolves.toEqual({ expiry: '72h', disable: false, autoRebuild: true });
    await adapter.writeCrlConfig(session, 'pki', { expiry: '', disable: true, autoRebuild: false });
    expect(call(fetchRequest, 3).body).toEqual({ disable: true, auto_rebuild: false });
    await adapter.rotateCrl(session, 'pki');
    expect(call(fetchRequest, 4)).toMatchObject({ url: 'https://vault.example.test/v1/pki/crl/rotate', method: 'GET' });
  });

  it('lists keys with their names', async () => {
    const { adapter } = setup(json({ data: { keys: ['k1'], key_info: { k1: { key_name: 'root-key', is_default: true } } } }));
    await expect(adapter.listKeys(session, 'pki')).resolves.toEqual([{ id: 'k1', name: 'root-key', isDefault: true }]);
  });
});
