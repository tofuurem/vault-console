import { describe, expect, it } from 'vitest';

import { PkiPrivateKey } from './pki';
import {
  certificateMatches,
  daysUntil,
  EMPTY_ROLE_INPUT,
  expiresWithin,
  expiryState,
  ipListError,
  isExpired,
  isIpAddress,
  issuerLabel,
  issuerNameError,
  roleDomainSummary,
  roleNameError,
  roleToInput,
  secondsToDuration,
  splitList,
  ttlError,
} from './pki-helpers';

const NOW = Date.UTC(2026, 9, 25);
const DAY = 86_400_000;

describe('expiry helpers', () => {
  it('classifies validity windows', () => {
    expect(expiryState({ notBefore: NOW - DAY, notAfter: NOW - 1 }, NOW)).toBe('expired');
    expect(expiryState({ notBefore: NOW - DAY, notAfter: NOW + 29 * DAY }, NOW)).toBe('expiring');
    expect(expiryState({ notBefore: NOW - DAY, notAfter: NOW + 31 * DAY }, NOW)).toBe('valid');
    expect(expiryState({ notBefore: NOW + DAY, notAfter: NOW + 90 * DAY }, NOW)).toBe('not-yet-valid');
    expect(isExpired(NOW, NOW)).toBe(true);
    expect(expiresWithin(NOW + 5 * DAY, 7, NOW)).toBe(true);
    expect(expiresWithin(NOW - DAY, 7, NOW)).toBe(false);
    expect(daysUntil(NOW + 2.5 * DAY, NOW)).toBe(2);
    expect(daysUntil(NOW - 0.5 * DAY, NOW)).toBe(-1);
  });
});

describe('form helpers', () => {
  it('splits lists and validates IP addresses', () => {
    expect(splitList(' a.example.com, b.example.com\n a.example.com ,, ')).toEqual(['a.example.com', 'b.example.com']);
    expect(splitList(undefined)).toEqual([]);
    expect(['10.0.0.1', '::1', '2001:db8::1', 'fe80::1:2:3:4', '::ffff:10.0.0.1', '1:2:3:4:5:6:7:8'].every(isIpAddress)).toBe(true);
    expect(['10.0.0.256', '1:2:3:4:5:6:7:8:9', '1::2::3', 'example.com', '1:2:3'].some(isIpAddress)).toBe(false);
    expect(ipListError('10.0.0.1, nope')).toBe('nope is not an IP address.');
    expect(ipListError('')).toBeUndefined();
    expect(ttlError('forever')).toBe('Use a duration such as 30m, 24h, or 720h.');
    expect(ttlError(undefined)).toBeUndefined();
  });

  it('validates role and issuer names', () => {
    expect(roleNameError('')).toBe('Enter a role name.');
    expect(roleNameError('web server')).toMatch(/letters/);
    expect(roleNameError('web', ['web'])).toMatch(/already exists/);
    expect(roleNameError('web-1.internal')).toBeUndefined();
    expect(issuerNameError('')).toBeUndefined();
    expect(issuerNameError('default')).toMatch(/reserved/);
    expect(issuerNameError('root 2026')).toMatch(/letters/);
    expect(issuerNameError('root-2026')).toBeUndefined();
  });

  it('formats durations and labels', () => {
    expect(secondsToDuration(0)).toBe('');
    expect(secondsToDuration(2_592_000)).toBe('720h');
    expect(secondsToDuration(90)).toBe('90s');
    expect(secondsToDuration(1_800)).toBe('30m');
    expect(issuerLabel({ id: '0185d612-9f13', name: '' })).toBe('0185d612');
    expect(issuerLabel({ id: '0185d612-9f13', name: 'root' })).toBe('root');
  });

  it('round-trips roles into form input and summarizes domains', () => {
    const role = { name: 'web', ...EMPTY_ROLE_INPUT, ttlSeconds: 3600, maxTtlSeconds: 0, allowedDomains: ['example.com'], allowSubdomains: true };
    const input = roleToInput(role);
    expect(input).toMatchObject({ ttl: '1h', maxTtl: '', allowedDomains: ['example.com'] });
    expect(input).not.toHaveProperty('name');
    expect(roleDomainSummary(role)).toBe('example.com (subdomains)');
    expect(roleDomainSummary({ ...role, allowAnyName: true })).toBe('Any name');
    expect(roleDomainSummary({ ...role, allowedDomains: [] })).toBe('No domains allowed');
  });
});

describe('certificate search', () => {
  it('matches serials without colons and common names case-insensitively', () => {
    const serial = '6a:36:9c:0a:99:3f';
    expect(certificateMatches('6a369c', serial)).toBe(true);
    expect(certificateMatches('6A:36', serial)).toBe(true);
    expect(certificateMatches('APP.example', serial, 'app.example.com')).toBe(true);
    expect(certificateMatches('zzz', serial, 'app.example.com')).toBe(false);
    expect(certificateMatches('  ', serial)).toBe(true);
  });
});

describe('errors and secrets', () => {
  it('redacts private keys in string and JSON contexts', () => {
    const key = new PkiPrivateKey('-----BEGIN PRIVATE KEY-----secret', 'ec');
    expect(String(key)).toBe('[REDACTED]');
    expect(JSON.stringify({ key })).toBe('{"key":"[REDACTED]"}');
    expect(key.reveal()).toContain('secret');
    expect(key.type).toBe('ec');
  });
});
