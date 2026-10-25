import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { Asn1Error, bitLength, decodeOid, decodeTime, readSingle, TAG } from './asn1';
import {
  certificatePems,
  containsPrivateKey,
  parseCertificatePem,
  parseCrlPem,
  pemBlocks,
  tryParseCertificate,
  X509ParseError,
} from './x509';

/** Vite refuses to serve .pem files, so fixtures are read from disk. */
function fixture(name: string): string {
  return readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', name), 'utf8');
}

const crlPem = fixture('intermediate.crl.pem');
const intermediatePem = fixture('intermediate-rsa2048.pem');
const leafEcPem = fixture('leaf-ec256.pem');
const leafEdPem = fixture('leaf-ed25519.pem');
const longPem = fixture('long-rsa4096.pem');
const rootEcPem = fixture('root-ec384.pem');
const rootEdPem = fixture('root-ed25519.pem');

// Expected values come from `openssl x509 -noout -text` on the same fixtures.
describe('parseCertificatePem', () => {
  it('reads a Vault-generated EC P-384 root CA', () => {
    const cert = parseCertificatePem(rootEcPem);
    expect(cert.serialNumber).toBe('46:e2:13:f8:72:bd:03:7c:bc:35:5e:1f:8d:b8:fe:10:fc:94:e8:94');
    expect(cert.subject.text).toBe('C=US, O=Example Co, CN=Example Root CA');
    expect(cert.subject.commonName).toBe('Example Root CA');
    expect(cert.issuer.text).toBe(cert.subject.text);
    expect(cert.notBefore).toBe(Date.UTC(2026, 9, 25, 15, 34, 23));
    expect(cert.notAfter).toBe(Date.UTC(2036, 9, 22, 15, 34, 53));
    expect(cert.altNames).toEqual({ dns: ['root.example.com'], ip: ['10.0.0.1'], email: [], uri: [] });
    expect(cert.isCa).toBe(true);
    expect(cert.pathLength).toBeUndefined();
    expect(cert).toMatchObject({ keyAlgorithm: 'EC', keySize: 384, curve: 'P-384', selfSigned: true });
    expect(cert.signatureAlgorithm).toBe('ECDSA with SHA384');
  });

  it('reads an RSA 2048 intermediate with a path length of zero', () => {
    const cert = parseCertificatePem(intermediatePem);
    expect(cert.subject.text).toBe('CN=Example Intermediate');
    expect(cert.issuer.text).toBe('C=US, O=Example Co, CN=Example Root CA');
    expect(cert).toMatchObject({ isCa: true, pathLength: 0, keyAlgorithm: 'RSA', keySize: 2048, selfSigned: false });
    expect(cert.notAfter).toBe(Date.UTC(2031, 9, 24, 15, 35, 0));
    expect(cert.authorityKeyId).toBe('eb:b6:c8:24:83:a3:15:3f:d2:17:40:b6:52:be:87:04:e8:d5:26:f4');
    expect(cert.subjectKeyId).toBe('86:13:77:fa:33:6c:dc:c2:82:7e:c1:bc:72:01:ab:e7:a5:5e:0d:d6');
  });

  it('reads a leaf with DNS and IP alternative names', () => {
    const cert = parseCertificatePem(leafEcPem);
    expect(cert.serialNumber).toBe('6a:36:9c:0a:99:3f:e7:f4:15:9f:33:d2:2e:71:da:94:6d:57:b8:f8');
    expect(cert.subject.commonName).toBe('app.example.com');
    expect(cert.altNames.dns).toEqual(['api.example.com', 'app.example.com']);
    expect(cert.altNames.ip).toEqual(['192.168.1.10']);
    expect(cert).toMatchObject({ isCa: false, keyAlgorithm: 'EC', keySize: 256, curve: 'P-256' });
    expect(cert.extendedKeyUsage).toEqual(['ServerAuth', 'ClientAuth']);
  });

  it('reads Ed25519 keys', () => {
    expect(parseCertificatePem(leafEdPem)).toMatchObject({
      serialNumber: '01:f7:d3:c8:cb:e3:73:dd:b2:d8:77:e8:f8:f1:ce:e6:4e:06:2d:e2',
      keyAlgorithm: 'Ed25519',
      keySize: 256,
    });
    const root = parseCertificatePem(rootEdPem);
    expect(root.subject.text).toBe('ST=IDF, L=Paris, OU=Sec, CN=Ed Root');
    expect(root).toMatchObject({ isCa: true, pathLength: 1, signatureAlgorithm: 'Ed25519' });
  });

  it('reads GeneralizedTime dates, email and IPv6 names, and the full subject', () => {
    const cert = parseCertificatePem(longPem);
    expect(cert.notAfter).toBe(Date.UTC(2054, 2, 12, 15, 35, 54));
    expect(cert.subject.text).toBe('C=DE, ST=Berlin, L=Berlin, O=Long Lived GmbH, OU=Platform, CN=long.example.org');
    expect(cert.altNames).toEqual({ dns: ['long.example.org'], ip: ['2001:db8::1'], email: ['ops@example.org'], uri: [] });
    expect(cert).toMatchObject({ isCa: false, keyAlgorithm: 'RSA', keySize: 4096, signatureAlgorithm: 'SHA256 with RSA' });
  });

  it('takes the first certificate of a bundle and skips private keys', () => {
    const bundle = `-----BEGIN EC PRIVATE KEY-----\nAAAA\n-----END EC PRIVATE KEY-----\n${leafEcPem}${intermediatePem}`;
    expect(parseCertificatePem(bundle).subject.commonName).toBe('app.example.com');
    // The intermediate fixture is Vault's pem_bundle output: the intermediate followed by its root.
    expect(certificatePems(bundle)).toHaveLength(3);
    expect(certificatePems(intermediatePem).map((pem) => parseCertificatePem(pem).subject.commonName))
      .toEqual(["Example Intermediate", "Example Root CA"]);
    expect(containsPrivateKey(bundle)).toBe(true);
    expect(containsPrivateKey(leafEcPem)).toBe(false);
  });

  it('rejects input that is not a certificate', () => {
    expect(() => parseCertificatePem('hello')).toThrow(X509ParseError);
    expect(() => parseCertificatePem('-----BEGIN CERTIFICATE-----\n!!!\n-----END CERTIFICATE-----')).toThrow('not valid base64');
    expect(() => parseCertificatePem('-----BEGIN CERTIFICATE-----\nMAMCAQE=\n-----END CERTIFICATE-----')).toThrow('not a valid certificate');
    const truncated = leafEcPem.replace(/\n[A-Za-z0-9+/]{64}\n/, "\n");
    expect(tryParseCertificate(truncated)).toBeUndefined();
    expect(tryParseCertificate(undefined)).toBeUndefined();
  });
});

describe('parseCrlPem', () => {
  it('reads the issuer, update times, and revoked entries', () => {
    const crl = parseCrlPem(crlPem);
    expect(crl.issuer.text).toBe('CN=Example Intermediate');
    expect(crl.thisUpdate).toBe(Date.UTC(2026, 9, 25, 15, 36, 49));
    expect(crl.nextUpdate).toBe(Date.UTC(2026, 9, 28, 15, 36, 49));
    expect(crl.revokedCount).toBe(1);
    expect(crl.crlNumber).toBe('7');
  });

  it('rejects a certificate passed as a CRL', () => {
    expect(() => parseCrlPem(leafEcPem)).toThrow(X509ParseError);
  });
});

describe('asn1', () => {
  it('decodes OIDs, bit lengths, and both time formats', () => {
    expect(decodeOid(Uint8Array.from([0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x0b]))).toBe('1.2.840.113549.1.1.11');
    expect(bitLength(Uint8Array.from([0x00, 0x80, 0x00]))).toBe(16);
    expect(bitLength(Uint8Array.from([0x01]))).toBe(1);
    const time = (tag: number, text: string) => decodeTime(readSingle(Uint8Array.from([tag, text.length, ...Array.from(text, (c) => c.charCodeAt(0))])));
    expect(time(TAG.utcTime, '491231235959Z')).toBe(Date.UTC(2049, 11, 31, 23, 59, 59));
    expect(time(TAG.utcTime, '500101000000Z')).toBe(Date.UTC(1950, 0, 1));
    expect(time(TAG.generalizedTime, '20540312153554.25Z')).toBe(Date.UTC(2054, 2, 12, 15, 35, 54, 250));
    expect(() => time(TAG.generalizedTime, '20540312153554+0100')).toThrow(Asn1Error);
  });

  it('rejects indefinite lengths and elements past the end', () => {
    expect(() => readSingle(Uint8Array.from([0x30, 0x80, 0x00, 0x00]))).toThrow('Indefinite');
    expect(() => readSingle(Uint8Array.from([0x30, 0x05, 0x00]))).toThrow('past the end');
    expect(() => readSingle(Uint8Array.from([0x05, 0x00, 0x00]))).toThrow('Trailing');
  });

  it('lists PEM blocks with their labels', () => {
    expect(pemBlocks(`${rootEcPem}${crlPem}`).map((block) => block.label)).toEqual(['CERTIFICATE', 'X509 CRL']);
  });
});
