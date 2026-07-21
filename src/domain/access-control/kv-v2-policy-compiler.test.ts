import { describe, expect, it } from 'vitest';

import {
  compileKvV2Policy,
  compileKvV2Rule,
  type LogicalKvAccessRule,
} from './kv-v2-policy-compiler';
import type { PolicySource } from './types';

const source: PolicySource = { kind: 'user-rule', id: 'alice-rule', label: 'Alice direct access' };

function access(overrides: Partial<LogicalKvAccessRule> = {}): LogicalKvAccessRule {
  return {
    mount: 'secret',
    path: 'apps/payments',
    target: 'folder',
    level: 'view',
    source,
    ...overrides,
  };
}

function pathsFor(input: LogicalKvAccessRule): Record<string, readonly string[]> {
  return Object.fromEntries(
    compileKvV2Rule(input).map((rule) => [rule.pattern, rule.capabilities]),
  );
}

describe('compileKvV2Rule', () => {
  it('does not emit a policy rule for inherited access', () => {
    expect(compileKvV2Rule(access({ level: 'inherited' }))).toEqual([]);
  });

  it('compiles View for a folder and only the required traversal paths', () => {
    expect(pathsFor(access())).toEqual({
      'secret/data/apps/payments/*': ['read'],
      'secret/metadata/apps/payments/*': ['read', 'list'],
      'secret/metadata': ['list'],
      'secret/metadata/apps': ['list'],
      'secret/metadata/apps/payments': ['list'],
    });
  });

  it('compiles Edit for one secret without treating it as a folder glob', () => {
    expect(pathsFor(access({ target: 'secret', level: 'edit' }))).toEqual({
      'secret/data/apps/payments': ['create', 'read', 'update', 'patch'],
      'secret/metadata/apps/payments': ['read'],
      'secret/metadata': ['list'],
      'secret/metadata/apps': ['list'],
    });
  });

  it('adds soft-delete and undelete paths for Manage versions', () => {
    const paths = pathsFor(access({ level: 'manage-versions' }));

    expect(paths['secret/data/apps/payments/*']).toContain('delete');
    expect(paths['secret/delete/apps/payments/*']).toEqual(['update']);
    expect(paths['secret/undelete/apps/payments/*']).toEqual(['update']);
    expect(paths['secret/destroy/apps/payments/*']).toBeUndefined();
  });

  it('adds destroy and metadata deletion for Owner', () => {
    const paths = pathsFor(access({ level: 'owner' }));

    expect(paths['secret/metadata/apps/payments/*']).toEqual(['read', 'delete', 'list']);
    expect(paths['secret/destroy/apps/payments/*']).toEqual(['update']);
    expect(paths['secret/metadata/apps/payments']).toEqual(['list']);
  });

  it('denies every endpoint family without granting ancestor traversal', () => {
    expect(pathsFor(access({ level: 'deny' }))).toEqual({
      'secret/data/apps/payments/*': ['deny'],
      'secret/metadata/apps/payments/*': ['deny'],
      'secret/delete/apps/payments/*': ['deny'],
      'secret/undelete/apps/payments/*': ['deny'],
      'secret/destroy/apps/payments/*': ['deny'],
      'secret/metadata/apps/payments': ['deny'],
    });
  });
});

describe('compileKvV2Policy', () => {
  it('renders deterministic, merged HCL independent of input order', () => {
    const view = access({ target: 'secret', path: 'apps/payments/api-key' });
    const edit = access({ target: 'secret', path: 'apps/payments/api-key', level: 'edit' });
    const forward = compileKvV2Policy([view, edit]).hcl;
    const reverse = compileKvV2Policy([edit, view]).hcl;

    expect(forward).toBe(reverse);
    expect(forward).toMatchInlineSnapshot(`
      "path \"secret/data/apps/payments/api-key\" {
        capabilities = [\"create\", \"read\", \"update\", \"patch\"]
      }

      path \"secret/metadata\" {
        capabilities = [\"list\"]
      }

      path \"secret/metadata/apps\" {
        capabilities = [\"list\"]
      }

      path \"secret/metadata/apps/payments\" {
        capabilities = [\"list\"]
      }

      path \"secret/metadata/apps/payments/api-key\" {
        capabilities = [\"read\"]
      }"
    `);
  });

  it('collapses a deny combined at the exact same path to deny-only HCL', () => {
    const result = compileKvV2Policy([
      access({ target: 'secret' }),
      access({ target: 'secret', level: 'deny' }),
    ]);

    expect(result.hcl).toContain('path "secret/data/apps/payments" {\n  capabilities = ["deny"]\n}');
    expect(result.hcl).not.toContain('capabilities = ["read", "deny"]');
  });
});
