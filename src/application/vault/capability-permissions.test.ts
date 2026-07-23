import { describe, expect, it } from 'vitest';

import {
  resolveAccessControlPermission,
  resolvePermission,
} from './capability-permissions';

describe('Vault capability decisions', () => {
  it('distinguishes allowed, denied, and unknown actions', () => {
    const capabilities = {
      'sys/mounts/applications': ['update', 'sudo'] as const,
      'sys/mounts/denied': ['deny'] as const,
    };

    expect(resolvePermission(
      capabilities,
      'ready',
      'sys/mounts/applications',
      ['update', 'sudo'],
    ).state).toBe('allowed');
    expect(resolvePermission(capabilities, 'ready', 'sys/mounts/denied', 'update').state).toBe('denied');
    expect(resolvePermission(capabilities, 'ready', 'sys/mounts/missing', 'update').state).toBe('unknown');
    expect(resolvePermission(capabilities, 'unavailable', 'sys/mounts/applications', 'update').state).toBe('unknown');
  });

  it('opens access control when any exact discovery surface is readable', () => {
    expect(resolveAccessControlPermission({
      'sys/auth': ['read'],
      'sys/policy': ['deny'],
      'identity/group/id': ['deny'],
      'identity/entity/id': ['deny'],
    }, 'ready').state).toBe('allowed');
  });

  it('keeps access control discoverable when capability introspection is unavailable', () => {
    expect(resolveAccessControlPermission({}, 'unavailable').state).toBe('unknown');
  });
});
