import { describe, expect, it } from 'vitest';

import { parseSshRoute, sshRoutePath } from './ssh-route';

describe('ssh routes', () => {
  it('parses tabs and roles from the sub-path', () => {
    expect(parseSshRoute('')).toEqual({ tab: 'ca' });
    expect(parseSshRoute('config/ca')).toEqual({ tab: 'ca' });
    expect(parseSshRoute('roles')).toEqual({ tab: 'roles' });
    expect(parseSshRoute('roles/ops')).toEqual({ tab: 'roles', role: 'ops' });
    expect(parseSshRoute('sign/ops/extra')).toEqual({ tab: 'sign', role: 'ops' });
    expect(parseSshRoute('otp')).toEqual({ tab: 'otp' });
  });

  it('formats routes back into sub-paths', () => {
    expect(sshRoutePath({ tab: 'ca' })).toBe('ca');
    expect(sshRoutePath({ tab: 'roles', role: 'ops' })).toBe('roles/ops');
    expect(sshRoutePath({ tab: 'otp' })).toBe('otp');
  });
});
