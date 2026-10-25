import { describe, expect, it } from 'vitest';

import keygenForeverHost from './fixtures/keygen-forever-host-cert.pub?raw';
import keygenWindowUser from './fixtures/keygen-window-user-cert.pub?raw';
import userEd25519 from './fixtures/user-ed25519.pub?raw';
import vaultEcdsa256User from './fixtures/vault-ecdsa256-user-cert.pub?raw';
import vaultEcdsa384Host from './fixtures/vault-ecdsa384-host-cert.pub?raw';
import vaultEcdsa521User from './fixtures/vault-ecdsa521-user-cert.pub?raw';
import vaultEd25519User from './fixtures/vault-ed25519-user-cert.pub?raw';
import vaultRsaCaSignedUser from './fixtures/vault-rsa-ca-signed-user-cert.pub?raw';
import vaultRsaUser from './fixtures/vault-rsa-user-cert.pub?raw';

import {
  parseSshCertificate,
  SshCertificateError,
  sshCertificateStatus,
  sshFingerprint,
  tryParseSshCertificate,
} from './ssh-certificate';

const FIXTURES: Readonly<Record<string, string>> = {
  'keygen-forever-host-cert.pub': keygenForeverHost,
  'keygen-window-user-cert.pub': keygenWindowUser,
  'user-ed25519.pub': userEd25519,
  'vault-ecdsa256-user-cert.pub': vaultEcdsa256User,
  'vault-ecdsa384-host-cert.pub': vaultEcdsa384Host,
  'vault-ecdsa521-user-cert.pub': vaultEcdsa521User,
  'vault-ed25519-user-cert.pub': vaultEd25519User,
  'vault-rsa-ca-signed-user-cert.pub': vaultRsaCaSignedUser,
  'vault-rsa-user-cert.pub': vaultRsaUser,
};

function fixture(name: string): string {
  return FIXTURES[name];
}

// Expected values come from `ssh-keygen -L -f <fixture>` (OpenSSH 9) run against
// certificates signed by a Vault 1.21.3 dev server and by `ssh-keygen -s`.
const VAULT_ED25519_CA = 'SHA256:T4YFeMNAgckzBf0N9jNvyOVT+r430HJvSq9cmC+kPuw';

describe('parseSshCertificate', () => {
  it('reads a Vault-signed ed25519 user certificate', async () => {
    const certificate = parseSshCertificate(fixture('vault-ed25519-user-cert.pub'));
    expect(certificate).toMatchObject({
      type: 'ssh-ed25519-cert-v01@openssh.com',
      keyType: 'ssh-ed25519',
      certType: 'user',
      serial: '7743063489429775254',
      serialHex: '6b74e33818c22396',
      keyId: 'alice@example',
      principals: ['deploy', 'ubuntu'],
      criticalOptions: [{ name: 'source-address', value: '10.0.0.0/8' }],
      extensions: [{ name: 'permit-port-forwarding', value: '' }, { name: 'permit-pty', value: '' }],
      signingKeyType: 'ssh-ed25519',
      signatureAlgorithm: 'ssh-ed25519',
    });
    expect(certificate.validAfter?.toISOString()).toBe('2026-10-25T15:34:24.000Z');
    expect(certificate.validBefore?.toISOString()).toBe('2026-10-25T16:04:54.000Z');
    await expect(sshFingerprint(certificate.signingKey)).resolves.toBe(VAULT_ED25519_CA);
  });

  it.each([
    ['vault-rsa-user-cert.pub', 'ssh-rsa', '5904404489190595813'],
    ['vault-ecdsa256-user-cert.pub', 'ecdsa-sha2-nistp256', '4693985452616496227'],
    ['vault-ecdsa521-user-cert.pub', 'ecdsa-sha2-nistp521', '179701664386934270'],
  ])('reads the key fields of %s', (name, keyType, serial) => {
    const certificate = parseSshCertificate(fixture(name));
    expect(certificate.keyType).toBe(keyType);
    expect(certificate.serial).toBe(serial);
    expect(certificate.principals).toEqual(['deploy', 'ubuntu']);
    expect(certificate.keyId).toBe('alice@example');
  });

  it('keeps serials above 2^63 exact and reads host certificates', () => {
    const certificate = parseSshCertificate(fixture('vault-ecdsa384-host-cert.pub'));
    expect(certificate.certType).toBe('host');
    expect(certificate.keyType).toBe('ecdsa-sha2-nistp384');
    expect(certificate.serial).toBe('12223664146137794579');
    expect(certificate.serialHex).toBe('a9a32dc6f438c813');
    expect(certificate.principals).toEqual(['web1.example.com']);
    expect(certificate.extensions).toEqual([]);
    expect(certificate.criticalOptions).toEqual([]);
  });

  it('reads the signature algorithm of an RSA CA', async () => {
    const certificate = parseSshCertificate(fixture('vault-rsa-ca-signed-user-cert.pub'));
    expect(certificate.signingKeyType).toBe('ssh-rsa');
    expect(certificate.signatureAlgorithm).toBe('rsa-sha2-512');
    expect(certificate.extensions.map((extension) => extension.name)).toEqual([
      'permit-X11-forwarding',
      'permit-agent-forwarding',
      'permit-port-forwarding',
      'permit-pty',
      'permit-user-rc',
    ]);
    await expect(sshFingerprint(certificate.signingKey)).resolves.toBe('SHA256:/pqB2RLz0l+KkEAesunDU4scGPrNaJC/nb2lSnCzSOk');
  });

  it('treats an unbounded window as forever and keeps an empty principal list', () => {
    const certificate = parseSshCertificate(fixture('keygen-forever-host-cert.pub'));
    expect(certificate).toMatchObject({ certType: 'host', serial: '42', keyId: 'forever-host', principals: [] });
    expect(certificate.validAfter).toBeNull();
    expect(certificate.validBefore).toBeNull();
    expect(sshCertificateStatus(certificate)).toBe('valid');
  });

  it('reads flag and valued critical options from ssh-keygen certificates', () => {
    const certificate = parseSshCertificate(fixture('keygen-window-user-cert.pub'));
    expect(certificate.serial).toBe('0');
    expect(certificate.principals).toEqual(['alice']);
    expect(certificate.criticalOptions).toEqual([
      { name: 'force-command', value: '/bin/true' },
      { name: 'verify-required', value: '' },
    ]);
    expect(certificate.extensions.map((extension) => extension.name)).not.toContain('permit-pty');
    expect(certificate.comment).toBe('fixture-rsa');
    expect(certificate.validAfter?.toISOString()).toBe('2025-12-31T17:00:00.000Z');
    expect(certificate.validBefore?.toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });

  it('rejects text that is not a well-formed certificate', () => {
    expect(() => parseSshCertificate(fixture('user-ed25519.pub'))).toThrow(SshCertificateError);
    expect(() => parseSshCertificate('ssh-ed25519-cert-v01@openssh.com not*base64')).toThrow('not valid base64');
    const truncated = fixture('vault-ed25519-user-cert.pub').split(' ')[1].slice(0, 120);
    expect(() => parseSshCertificate(`ssh-ed25519-cert-v01@openssh.com ${truncated}`)).toThrow('malformed');
    const [, body] = fixture('vault-rsa-user-cert.pub').split(' ');
    expect(() => parseSshCertificate(`ssh-ed25519-cert-v01@openssh.com ${body}`)).toThrow('does not match');
    expect(tryParseSshCertificate('garbage')).toBeUndefined();
  });
});

describe('sshCertificateStatus', () => {
  const window = { validAfter: new Date('2026-01-01T00:00:00Z'), validBefore: new Date('2026-01-02T00:00:00Z') };

  it('compares the validity window with now', () => {
    expect(sshCertificateStatus(window, Date.parse('2025-12-31T23:59:59Z'))).toBe('not-yet-valid');
    expect(sshCertificateStatus(window, Date.parse('2026-01-01T12:00:00Z'))).toBe('valid');
    expect(sshCertificateStatus(window, Date.parse('2026-01-02T00:00:00Z'))).toBe('expired');
  });
});
