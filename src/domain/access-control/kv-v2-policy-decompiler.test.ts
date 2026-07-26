import { describe, expect, it } from 'vitest';

import {
  compileKvV2Policy,
  type LogicalKvAccessRule,
} from './kv-v2-policy-compiler';
import { decompileKvV2Policy } from './kv-v2-policy-decompiler';
import type { PolicySource } from './types';

const source: PolicySource = {
  kind: 'user-rule',
  id: 'vc-user-alice',
  label: 'Per-user rule',
};

function rule(
  mount: string,
  path: string,
  target: 'folder' | 'secret',
  level: LogicalKvAccessRule['level'],
): LogicalKvAccessRule {
  return { mount, path, target, level, source };
}

describe('canonical KV v2 policy decompiler', () => {
  it('round-trips supported folder, secret, owner, and deny rules', () => {
    const logical = [
      rule('applications', 'billing', 'folder', 'edit'),
      rule('applications', 'payments/token', 'secret', 'view'),
      rule('platform', 'infrastructure/postgres', 'folder', 'owner'),
      rule('platform', 'legacy', 'folder', 'deny'),
    ];
    const compiled = compileKvV2Policy(logical);

    expect(decompileKvV2Policy(
      compiled.hcl,
      ['applications', 'platform'],
      source,
    )).toEqual(logical);
  });

  it('supports nested auth-style mount paths by matching the longest known mount', () => {
    const logical = [
      rule('team/secrets', 'billing', 'folder', 'manage-versions'),
    ];

    expect(decompileKvV2Policy(
      compileKvV2Policy(logical).hcl,
      ['team', 'team/secrets'],
      source,
    )).toEqual(logical);
  });

  it('fails closed when rules include unsupported or unmatched HCL', () => {
    expect(decompileKvV2Policy(
      'path "applications/data/*" { capabilities = ["read"] }\nfoo = "bar"',
      ['applications'],
      source,
    )).toBeNull();
    expect(decompileKvV2Policy(
      'path "unknown/data/*" { capabilities = ["read"] }',
      ['applications'],
      source,
    )).toBeNull();
    expect(decompileKvV2Policy(
      'path "applications/data/*" { capabilities = ["read"] }\npath "sys/health" { capabilities = ["read"] }',
      ['applications'],
      source,
    )).toBeNull();
  });
});
