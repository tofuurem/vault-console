import { describe, expect, it, vi } from 'vitest';

import { sshOtp, sshPrivateKey } from '@/domain/engines/ssh/ssh';
import { emptyCaRoleInput, emptyOtpRole } from '@/domain/engines/ssh/ssh-roles';
import { vaultToken } from '@/domain/vault/sensitive-value';
import { VaultHttpClient, type VaultFetch } from '../../vault/http/vault-http-client';
import { VaultSshAdapter } from './vault-ssh-adapter';

const session = { serverUrl: 'https://vault.example.test', token: vaultToken('hvs.op'), authMethod: 'token' as const };
const CA_KEY = 'ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIMBnnfWU9yMBeu4YrxIY42vt0Qr/h3nBSWpwr+XNtp1f';

function json(body: unknown, status = 200) {
  return status === 204
    ? new Response(null, { status })
    : new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function setup(...responses: Response[]) {
  const fetchRequest = vi.fn<VaultFetch>();
  responses.forEach((response) => fetchRequest.mockResolvedValueOnce(response));
  const adapter = new VaultSshAdapter(new VaultHttpClient(fetchRequest));
  const call = (index: number) => {
    const [url, init] = fetchRequest.mock.calls[index];
    return { url: String(url), method: init?.method, body: init?.body ? JSON.parse(String(init.body)) as unknown : undefined };
  };
  return { adapter, fetchRequest, call };
}

// Shapes below were captured from Vault 1.21.3.
const CA_ROLE = {
  algorithm_signer: 'default',
  allow_bare_domains: false,
  allow_empty_principals: false,
  allow_host_certificates: false,
  allow_subdomains: false,
  allow_user_certificates: true,
  allow_user_key_ids: true,
  allowed_critical_options: 'force-command,source-address',
  allowed_domains: '',
  allowed_domains_template: false,
  allowed_users_template: true,
  allowed_extensions: 'permit-pty,permit-port-forwarding',
  allowed_user_key_lengths: { ed25519: [0], rsa: [2048, 4096] },
  allowed_users: '*',
  default_critical_options: {},
  default_extensions: { 'permit-pty': '' },
  default_user: 'ubuntu',
  key_id_format: '',
  key_type: 'ca',
  max_ttl: 86400,
  not_before_duration: 30,
  ttl: 1800,
};

describe('VaultSshAdapter CA', () => {
  it('reads the CA and treats Vault’s 400 for an empty CA as not configured', async () => {
    const { adapter, call } = setup(
      json({ data: { public_key: `${CA_KEY}\n` } }),
      json({ errors: ["keys haven't been configured yet"] }, 400),
      json({ errors: [] }, 404),
    );
    await expect(adapter.readCa(session, 'ssh/client')).resolves.toEqual({ publicKey: CA_KEY });
    expect(call(0).url).toBe('https://vault.example.test/v1/ssh/client/config/ca');
    await expect(adapter.readCa(session, 'ssh')).resolves.toBeNull();
    await expect(adapter.readCa(session, 'ssh')).resolves.toBeNull();
  });

  it('surfaces permission errors instead of an empty state', async () => {
    const { adapter } = setup(json({ errors: ['permission denied'] }, 403));
    await expect(adapter.readCa(session, 'ssh')).rejects.toMatchObject({ code: 'authorization' });
  });

  it('generates a signing key and returns the new public key', async () => {
    const { adapter, call } = setup(json({ data: { public_key: `${CA_KEY}\n` } }));
    await expect(adapter.configureCa(session, 'ssh', { mode: 'generate', keyType: 'ssh-rsa', keyBits: 4096 }))
      .resolves.toEqual({ publicKey: CA_KEY });
    expect(call(0)).toMatchObject({
      method: 'POST',
      body: { generate_signing_key: true, key_type: 'ssh-rsa', key_bits: 4096 },
    });
  });

  it('imports a key pair; Vault answers 204', async () => {
    const { adapter, call } = setup(json(null, 204), json(null, 204));
    const privateKey = sshPrivateKey('-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----');
    await expect(adapter.configureCa(session, 'ssh', { mode: 'import', privateKey, publicKey: ` ${CA_KEY}\n` })).resolves.toBeNull();
    expect(call(0).body).toEqual({ generate_signing_key: false, private_key: privateKey.reveal(), public_key: CA_KEY });
    await adapter.deleteCa(session, 'ssh');
    expect(call(1)).toMatchObject({ method: 'DELETE', url: 'https://vault.example.test/v1/ssh/config/ca' });
  });
});

describe('VaultSshAdapter roles', () => {
  it('lists roles with their key types; 404 means none', async () => {
    const { adapter, call } = setup(
      json({ data: { key_info: { hosts: { key_type: 'ca' }, otp1: { key_type: 'otp' } }, keys: ['hosts', 'otp1', 'legacy'] } }),
      json({ errors: [] }, 404),
    );
    await expect(adapter.listRoles(session, 'ssh')).resolves.toEqual([
      { name: 'hosts', keyType: 'ca' },
      { name: 'otp1', keyType: 'otp' },
      { name: 'legacy', keyType: 'unknown' },
    ]);
    expect(call(0).url).toBe('https://vault.example.test/v1/ssh/roles?list=true');
    await expect(adapter.listRoles(session, 'ssh')).resolves.toEqual([]);
  });

  it('reads CA and OTP roles and validates fields', async () => {
    const { adapter, call } = setup(
      json({ data: CA_ROLE }),
      json({ data: { allowed_users: '', cidr_list: '10.0.0.0/8', default_user: 'ubuntu', exclude_cidr_list: '', key_type: 'otp', port: 22 } }),
      json({ data: { ...CA_ROLE, ttl: '30m' } }),
      json({ data: { key_type: 'dynamic' } }),
    );
    await expect(adapter.readRole(session, 'ssh', 'ops team')).resolves.toMatchObject({
      keyType: 'ca',
      allowUserKeyIds: true,
      allowedUserKeyLengths: { ed25519: [0], rsa: [2048, 4096] },
      defaultExtensions: { 'permit-pty': '' },
      ttlSeconds: 1800,
      maxTtlSeconds: 86400,
      notBeforeDurationSeconds: 30,
      allowedUsersTemplate: true,
      allowedDomainsTemplate: false,
    });
    expect(call(0).url).toBe('https://vault.example.test/v1/ssh/roles/ops%20team');
    await expect(adapter.readRole(session, 'ssh', 'otp1')).resolves.toEqual({
      keyType: 'otp', defaultUser: 'ubuntu', allowedUsers: '', cidrList: '10.0.0.0/8', excludeCidrList: '', port: 22,
    });
    await expect(adapter.readRole(session, 'ssh', 'ops')).rejects.toMatchObject({ code: 'invalid-response' });
    await expect(adapter.readRole(session, 'ssh', 'legacy')).rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('rejects role names that would change the path', async () => {
    const { adapter, fetchRequest } = setup();
    await expect(adapter.readRole(session, 'ssh', '../config/ca')).rejects.toMatchObject({ code: 'invalid-request' });
    await expect(adapter.deleteRole(session, 'ssh', '..')).rejects.toMatchObject({ code: 'invalid-request' });
    expect(fetchRequest).not.toHaveBeenCalled();
  });

  it('writes CA and OTP roles with Vault field names', async () => {
    const { adapter, call } = setup(json(null, 204), json(null, 204), json(null, 204));
    await adapter.writeRole(session, 'ssh', 'ops', {
      ...emptyCaRoleInput(),
      allowedUsers: ' ubuntu,deploy ',
      ttl: '30m',
      allowedUserKeyLengths: { rsa: [4096] },
      defaultCriticalOptions: { 'source-address': '10.0.0.0/8' },
    });
    expect(call(0)).toMatchObject({ method: 'POST', url: 'https://vault.example.test/v1/ssh/roles/ops' });
    expect(call(0).body).toMatchObject({
      key_type: 'ca',
      allow_user_certificates: true,
      allowed_users: 'ubuntu,deploy',
      default_extensions: { 'permit-pty': '' },
      default_critical_options: { 'source-address': '10.0.0.0/8' },
      allowed_user_key_lengths: { rsa: [4096] },
      ttl: '30m',
      max_ttl: '0',
      not_before_duration: '30s',
      algorithm_signer: 'default',
      allowed_users_template: false,
      allow_empty_principals: false,
    });
    await adapter.writeRole(session, 'ssh', 'otp1', { ...emptyOtpRole(), defaultUser: 'ubuntu', cidrList: '10.0.0.0/8', port: 2222 });
    expect(call(1).body).toEqual({
      key_type: 'otp', default_user: 'ubuntu', allowed_users: '', cidr_list: '10.0.0.0/8', exclude_cidr_list: '', port: 2222,
    });
    await adapter.deleteRole(session, 'ssh', 'otp1');
    expect(call(2)).toMatchObject({ method: 'DELETE', url: 'https://vault.example.test/v1/ssh/roles/otp1' });
  });
});

describe('VaultSshAdapter signing and OTP', () => {
  it('signs a key and sends only the fields that were set', async () => {
    const { adapter, call } = setup(
      json({ data: { serial_number: '6b74e33818c22396', signed_key: 'ssh-ed25519-cert-v01@openssh.com AAAA\n' } }),
      json({ data: { serial_number: '1', signed_key: 'x' } }),
      json({ data: { signed_key: 'x' } }),
    );
    await expect(adapter.signKey(session, 'ssh', {
      role: 'ops',
      publicKey: ' ssh-ed25519 AAAA me\n',
      validPrincipals: 'ubuntu,deploy',
      certType: 'user',
      ttl: '30m',
      keyId: 'alice',
      extensions: { 'permit-pty': '' },
      criticalOptions: { 'source-address': '10.0.0.0/8' },
    })).resolves.toEqual({ serialNumber: '6b74e33818c22396', signedKey: 'ssh-ed25519-cert-v01@openssh.com AAAA' });
    expect(call(0)).toMatchObject({ url: 'https://vault.example.test/v1/ssh/sign/ops', method: 'POST' });
    expect(call(0).body).toEqual({
      public_key: 'ssh-ed25519 AAAA me',
      cert_type: 'user',
      valid_principals: 'ubuntu,deploy',
      ttl: '30m',
      key_id: 'alice',
      extensions: { 'permit-pty': '' },
      critical_options: { 'source-address': '10.0.0.0/8' },
    });
    await adapter.signKey(session, 'ssh', { role: 'hosts', publicKey: 'k', validPrincipals: ' ', certType: 'host', ttl: '', keyId: '', criticalOptions: {} });
    expect(call(1).body).toEqual({ public_key: 'k', cert_type: 'host' });
    await expect(adapter.signKey(session, 'ssh', { role: 'ops', publicKey: 'k', validPrincipals: '', certType: 'user', ttl: '', keyId: '' }))
      .rejects.toMatchObject({ code: 'invalid-response' });
  });

  it('creates an OTP that never serializes', async () => {
    const { adapter, call } = setup(json({
      lease_id: 'ssh/creds/otp1/oCsLG7Rmhmt3HzH0itzQDhyl',
      renewable: false,
      lease_duration: 2764800,
      data: { ip: '10.1.2.3', key: 'c216522d-0b57-7384-f549-ed4751e61652', key_type: 'otp', port: 22, username: 'ubuntu' },
    }));
    const credential = await adapter.createOtp(session, 'ssh', 'otp1', { ip: ' 10.1.2.3 ', username: '' });
    expect(call(0)).toMatchObject({ url: 'https://vault.example.test/v1/ssh/creds/otp1', body: { ip: '10.1.2.3' } });
    expect(credential.otp.reveal()).toBe('c216522d-0b57-7384-f549-ed4751e61652');
    expect(JSON.stringify(credential)).not.toContain('c216522d');
    expect(credential).toMatchObject({ ip: '10.1.2.3', username: 'ubuntu', port: 22, leaseId: 'ssh/creds/otp1/oCsLG7Rmhmt3HzH0itzQDhyl', leaseDurationSeconds: 2764800 });
  });

  it('verifies an OTP; Vault’s 400 means unknown or used', async () => {
    const { adapter, call } = setup(
      json({ data: { ip: '10.9.9.9', role_name: 'otp1', username: 'ubuntu' } }),
      json({ errors: ['OTP not found'] }, 400),
      json({ errors: ['permission denied'] }, 403),
    );
    await expect(adapter.verifyOtp(session, 'ssh', sshOtp('abc'))).resolves.toEqual({ ip: '10.9.9.9', username: 'ubuntu', roleName: 'otp1' });
    expect(call(0).body).toEqual({ otp: 'abc' });
    await expect(adapter.verifyOtp(session, 'ssh', sshOtp('abc'))).resolves.toBeNull();
    await expect(adapter.verifyOtp(session, 'ssh', sshOtp('abc'))).rejects.toMatchObject({ code: 'authorization' });
  });

  it('reads, writes, and clears zero-address roles', async () => {
    const { adapter, call } = setup(
      json({ data: { roles: ['otp1'] } }),
      json({ errors: [] }, 404),
      json(null, 204),
      json(null, 204),
    );
    await expect(adapter.readZeroAddressRoles(session, 'ssh')).resolves.toEqual(['otp1']);
    await expect(adapter.readZeroAddressRoles(session, 'ssh')).resolves.toEqual([]);
    await adapter.writeZeroAddressRoles(session, 'ssh', ['otp1', 'otp2']);
    expect(call(2)).toMatchObject({ method: 'POST', body: { roles: 'otp1,otp2' } });
    await adapter.writeZeroAddressRoles(session, 'ssh', []);
    expect(call(3)).toMatchObject({ method: 'DELETE', url: 'https://vault.example.test/v1/ssh/config/zeroaddress' });
  });
});
