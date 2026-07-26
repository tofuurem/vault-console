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

  it('rejects a policy when any HCL remains unconsumed', () => {
    expect(parseManagedPolicyHcl(`path "applications/data/billing/*" {
  capabilities = ["read"]
}

path "applications/metadata/billing/*" {
  capabilities = ["list"]
  allowed_parameters = {"scope" = []}
}`)).toBeNull();
  });

  it('accepts comments and escaped JSON path strings while consuming the complete policy', () => {
    expect(parseManagedPolicyHcl(`# generated policy
path "applications/data/a\\\"b" {
  # read the value
  capabilities = [
    "read",
    "patch"
  ]
}`)).toEqual([
      { pattern: 'applications/data/a"b', capabilities: ['read', 'patch'] },
    ]);
  });

  it('rejects unknown capabilities, empty lists, and trailing statements', () => {
    expect(parseManagedPolicyHcl('path "secret/*" { capabilities = ["root"] }')).toBeNull();
    expect(parseManagedPolicyHcl('path "secret/*" { capabilities = [] }')).toBeNull();
    expect(parseManagedPolicyHcl(
      'path "secret/*" { capabilities = ["read"] }\nvariable "x" {}',
    )).toBeNull();
  });
});
