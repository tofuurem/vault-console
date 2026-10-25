import { describe, expect, it } from 'vitest';

import ED25519 from './fixtures/user-ed25519.pub?raw';
import CERTIFICATE from './fixtures/vault-ed25519-user-cert.pub?raw';

import {
  certificateFileName,
  formatKeyLengths,
  formatOptionLines,
  ipAddressError,
  parseKeyLengths,
  parseOptionLines,
  parseSshPublicKey,
  splitList,
  sshConnectHint,
  sshPublicKeyError,
  sshTrustSnippets,
} from './ssh-keys';
import { encodeBase64 } from './ssh-wire';

function wireKey(type: string, ...fields: Uint8Array[]): string {
  const parts = [new TextEncoder().encode(type), ...fields];
  const bytes: number[] = [];
  parts.forEach((part) => {
    bytes.push((part.length >>> 24) & 0xff, (part.length >>> 16) & 0xff, (part.length >>> 8) & 0xff, part.length & 0xff, ...part);
  });
  return `${type} ${encodeBase64(new Uint8Array(bytes))}`;
}

describe('parseSshPublicKey', () => {
  it('accepts a real ed25519 key and keeps its comment', () => {
    const result = parseSshPublicKey(ED25519);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.key.type).toBe('ssh-ed25519');
      expect(result.key.comment).toBe('fixture-ed25519');
    }
  });

  it.each([
    'ssh-rsa',
    'ecdsa-sha2-nistp256',
    'ecdsa-sha2-nistp384',
    'ecdsa-sha2-nistp521',
    'sk-ssh-ed25519@openssh.com',
    'sk-ecdsa-sha2-nistp256@openssh.com',
  ])('accepts %s keys whose body names the same type', (type) => {
    expect(sshPublicKeyError(wireKey(type, new Uint8Array([1, 2, 3])))).toBeUndefined();
  });

  it('explains common paste mistakes', () => {
    expect(sshPublicKeyError('')).toBe('Paste a public key.');
    expect(sshPublicKeyError('-----BEGIN OPENSSH PRIVATE KEY-----\nabc\n-----END OPENSSH PRIVATE KEY-----')).toMatch(/private key/);
    expect(sshPublicKeyError(CERTIFICATE)).toMatch(/already a certificate/);
    expect(sshPublicKeyError('ssh-dss AAAAB3NzaC1kc3M=')).toMatch(/Use an ssh-ed25519/);
    expect(sshPublicKeyError('ssh-ed25519 not-base64!')).toMatch(/not valid base64/);
    expect(sshPublicKeyError(wireKey('ssh-rsa').replace(/^ssh-rsa/, 'ssh-ed25519'))).toMatch(/does not contain an ssh-ed25519 key/);
    expect(sshPublicKeyError(`${ED25519.trim()}\n${ED25519.trim()}`)).toMatch(/single public key/);
  });
});

describe('certificateFileName', () => {
  it('follows the OpenSSH naming convention', () => {
    expect(certificateFileName('ssh-ed25519')).toBe('id_ed25519-cert.pub');
    expect(certificateFileName('ssh-rsa-cert-v01@openssh.com')).toBe('id_rsa-cert.pub');
    expect(certificateFileName('ecdsa-sha2-nistp384')).toBe('id_ecdsa-cert.pub');
    expect(certificateFileName('sk-ssh-ed25519@openssh.com')).toBe('id_ed25519_sk-cert.pub');
    expect(certificateFileName('sk-ecdsa-sha2-nistp256@openssh.com')).toBe('id_ecdsa_sk-cert.pub');
    expect(certificateFileName('unknown')).toBe('id-cert.pub');
    expect(sshConnectHint('ssh-ed25519', 'ubuntu')).toBe('ssh -i ~/.ssh/id_ed25519 -o CertificateFile=~/.ssh/id_ed25519-cert.pub ubuntu@host');
    expect(sshConnectHint('ssh-rsa', undefined)).toContain(' user@host');
  });
});

describe('ipAddressError', () => {
  it.each(['10.0.0.5', '255.255.255.255', '::1', '2001:db8::8a2e:370:7334', 'fe80::', '::ffff:192.168.1.1', '2001:0db8:0000:0000:0000:ff00:0042:8329'])(
    'accepts %s',
    (value) => expect(ipAddressError(value)).toBeUndefined(),
  );

  it.each(['', '256.1.1.1', '10.0.0', '10.0.0.5/32', 'host.example.com', '1::2::3', '2001:db8:1:2:3:4:5:6:7', '01.2.3.4', 'fe80::1%eth0'])(
    'rejects %j',
    (value) => expect(ipAddressError(value)).toBeDefined(),
  );
});

describe('option and list parsing', () => {
  it('parses critical options and round-trips them', () => {
    const result = parseOptionLines('source-address=10.0.0.0/8, 192.168.0.0/16\n\nno-touch-required\n');
    expect(result).toEqual({ ok: true, value: { 'source-address': '10.0.0.0/8, 192.168.0.0/16', 'no-touch-required': '' } });
    if (result.ok) expect(formatOptionLines(result.value)).toBe('source-address=10.0.0.0/8, 192.168.0.0/16\nno-touch-required');
    expect(parseOptionLines('bad name=1').ok).toBe(false);
  });

  it('parses allowed key lengths', () => {
    const result = parseKeyLengths('rsa=2048, 4096\ned25519=0');
    expect(result).toEqual({ ok: true, value: { rsa: [2048, 4096], ed25519: [0] } });
    if (result.ok) expect(formatKeyLengths(result.value)).toBe('rsa=2048,4096\ned25519=0');
    expect(parseKeyLengths('rsa').ok).toBe(false);
    expect(parseKeyLengths('rsa=big').ok).toBe(false);
    expect(parseKeyLengths('').ok).toBe(true);
  });

  it('splits comma and newline lists', () => {
    expect(splitList(' ubuntu, deploy\nadmin ,, ')).toEqual(['ubuntu', 'deploy', 'admin']);
  });
});

describe('sshTrustSnippets', () => {
  it('builds sshd and known_hosts lines and the public key URL', () => {
    const snippets = sshTrustSnippets('ssh-ed25519 AAAA\n', 'ssh-client', 'https://vault.example.com:8200/');
    expect(snippets.publicKeyUrl).toBe('https://vault.example.com:8200/v1/ssh-client/public_key');
    expect(snippets.sshdConfig).toBe('TrustedUserCAKeys /etc/ssh/trusted-user-ca-keys.pem');
    expect(snippets.sshdInstall).toBe('curl -o /etc/ssh/trusted-user-ca-keys.pem https://vault.example.com:8200/v1/ssh-client/public_key');
    expect(snippets.knownHosts).toBe('@cert-authority *.example.com ssh-ed25519 AAAA');
  });
});
