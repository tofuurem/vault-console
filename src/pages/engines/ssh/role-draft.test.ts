import { describe, expect, it } from 'vitest';

import { emptyCaRoleInput, emptyOtpRole } from '@/domain/engines/ssh/ssh-roles';
import { roleDraft, roleInputFromDraft, type CaRoleDraft, type OtpRoleDraft } from './role-draft';

describe('role drafts', () => {
  it('splits standard and custom extensions and reassembles them', () => {
    const draft = roleDraft({
      ...emptyCaRoleInput(),
      allowedExtensions: 'permit-pty,login@example.com,permit-user-rc',
      defaultExtensions: { 'permit-pty': '', 'login@example.com': 'alice' },
      defaultCriticalOptions: { 'source-address': '10.0.0.0/8' },
      allowedUserKeyLengths: { rsa: [4096] },
    }) as CaRoleDraft;
    expect(draft).toMatchObject({
      allowedStandard: ['permit-pty', 'permit-user-rc'],
      defaultStandard: ['permit-pty'],
      otherAllowedExtensions: 'login@example.com',
      otherDefaultExtensions: 'login@example.com=alice',
      defaultCriticalOptions: 'source-address=10.0.0.0/8',
      allowedUserKeyLengths: 'rsa=4096',
    });
    const result = roleInputFromDraft(draft);
    expect(result).toEqual({
      ok: true,
      input: expect.objectContaining({
        allowedExtensions: 'permit-pty,permit-user-rc,login@example.com',
        defaultExtensions: { 'permit-pty': '', 'login@example.com': 'alice' },
        defaultCriticalOptions: { 'source-address': '10.0.0.0/8' },
        allowedUserKeyLengths: { rsa: [4096] },
      }),
    });
  });

  it('reports free-text and duration errors together', () => {
    const draft = { ...(roleDraft(emptyCaRoleInput()) as CaRoleDraft), allowedUserKeyLengths: 'rsa', ttl: 'later' };
    expect(roleInputFromDraft(draft)).toEqual({
      ok: false,
      errors: { allowedUserKeyLengths: expect.any(String), ttl: expect.any(String) },
    });
  });

  it('parses the OTP port', () => {
    const draft = roleDraft({ ...emptyOtpRole(), defaultUser: 'ubuntu' }) as OtpRoleDraft;
    expect(roleInputFromDraft({ ...draft, port: '2222' })).toEqual({ ok: true, input: expect.objectContaining({ port: 2222 }) });
    expect(roleInputFromDraft({ ...draft, port: '22a' })).toEqual({ ok: false, errors: { port: expect.any(String) } });
  });
});
