import { describe, expect, it } from 'vitest';

import { sshOtp, sshPrivateKey } from './ssh';
import {
  emptyCaRoleInput,
  emptyOtpRole,
  emptyRoleInput,
  formatRoleTtl,
  roleToInput,
  secondsToDuration,
  sshRoleInputErrors,
  sshRoleNameError,
} from './ssh-roles';

describe('ssh roles', () => {
  it('validates role names', () => {
    expect(sshRoleNameError('ops-team')).toBeUndefined();
    expect(sshRoleNameError('')).toBe('Enter a role name.');
    expect(sshRoleNameError('ops/team')).toBeDefined();
    expect(sshRoleNameError('-ops')).toBeDefined();
  });

  it('validates CA role durations and certificate kinds', () => {
    expect(sshRoleInputErrors(emptyCaRoleInput())).toEqual({});
    expect(sshRoleInputErrors({
      ...emptyCaRoleInput(),
      ttl: 'soon',
      maxTtl: '24h',
      notBeforeDuration: 'x',
      allowUserCertificates: false,
    })).toEqual({
      ttl: expect.stringContaining('duration'),
      notBeforeDuration: expect.stringContaining('duration'),
      certificates: 'Allow user certificates, host certificates, or both.',
    });
  });

  it('validates OTP roles', () => {
    expect(sshRoleInputErrors({ ...emptyOtpRole(), defaultUser: 'ubuntu', cidrList: '10.0.0.0/8, fd00::/8' })).toEqual({});
    expect(sshRoleInputErrors({ ...emptyOtpRole(), port: 0, cidrList: '10.0.0.0' })).toEqual({
      port: expect.any(String),
      cidrList: expect.any(String),
      defaultUser: 'OTP roles need a default user.',
    });
    expect(emptyRoleInput('otp').keyType).toBe('otp');
  });

  it('turns stored seconds back into durations', () => {
    const { ttl, maxTtl, notBeforeDuration, ...rest } = emptyCaRoleInput();
    const input = roleToInput({ ...rest, ttlSeconds: 1800, maxTtlSeconds: 0, notBeforeDurationSeconds: 30 });
    expect(input).toMatchObject({ ttl: '30m', maxTtl: '', notBeforeDuration: '30s' });
    expect([secondsToDuration(86400), secondsToDuration(90), secondsToDuration(0)]).toEqual(['24h', '90s', '']);
    expect([ttl, maxTtl, notBeforeDuration]).toEqual(['', '', '30s']);
    expect(formatRoleTtl(1800)).toBe('30m');
    expect(formatRoleTtl(0)).toBe('Engine default');
  });

  it('keeps secrets out of serialization', () => {
    const otp = sshOtp('c216522d-0b57');
    expect(otp.reveal()).toBe('c216522d-0b57');
    expect(JSON.stringify({ otp, key: sshPrivateKey('-----BEGIN') })).toBe('{"otp":"[REDACTED]","key":"[REDACTED]"}');
    expect(String(otp)).toBe('[REDACTED]');
  });
});
