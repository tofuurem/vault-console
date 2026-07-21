import { describe, expect, it } from 'vitest';

import { classifyPolicyName, managedRoleName, parseManagedPolicyHcl } from './managed-resources';

describe('managed access-control resources', () => {
  it('classifies stable role and per-user policy prefixes', () => {
    expect(classifyPolicyName('vc-role-platform-readers')).toBe('role');
    expect(classifyPolicyName('vc-user-alice')).toBe('user-direct');
    expect(classifyPolicyName('legacy-ops')).toBe('external');
    expect(managedRoleName('vc-role-platform-readers')).toBe('Platform Readers');
  });

  it('parses the deterministic HCL emitted by the KV v2 compiler', () => {
    expect(parseManagedPolicyHcl(`path "applications/data/billing/*" {\n  capabilities = ["create", "read", "update"]\n}\n\npath "applications/metadata/billing" {\n  capabilities = ["list"]\n}`)).toEqual([
      { pattern: 'applications/data/billing/*', capabilities: ['create', 'read', 'update'] },
      { pattern: 'applications/metadata/billing', capabilities: ['list'] },
    ]);
  });

  it('leaves arbitrary external HCL unresolved', () => {
    expect(parseManagedPolicyHcl('import "something"')).toBeNull();
  });
});
