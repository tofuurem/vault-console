import { describe, expect, it } from 'vitest';

import type { AccessPolicyRule } from './effective-access';
import { deriveManagedKvTargets } from './policy-targets';

function rule(
  pattern: string,
  capabilities: AccessPolicyRule['capabilities'],
): AccessPolicyRule {
  return { pattern, capabilities };
}

describe('deriveManagedKvTargets', () => {
  it('derives one recursive folder target without exposing ancestor traversal rules', () => {
    const result = deriveManagedKvTargets(['applications'], [
      rule('applications/data/platform/*', ['read']),
      rule('applications/metadata/platform/*', ['read', 'list']),
      rule('applications/metadata', ['list']),
      rule('applications/metadata/platform', ['list']),
    ]);

    expect(result.targets).toEqual([{
      id: 'applications:folder:platform',
      mount: 'applications',
      path: 'platform',
      target: 'folder',
      patterns: [
        'applications/data/platform/*',
        'applications/metadata/platform/*',
      ],
    }]);
    expect(result.ignoredTraversalPatterns).toEqual([
      'applications/metadata',
      'applications/metadata/platform',
    ]);
    expect(result.issues).toEqual([]);
  });

  it('distinguishes exact secrets, recursive folders, and root folders', () => {
    const result = deriveManagedKvTargets(['applications'], [
      rule('applications/data/platform/api', ['read']),
      rule('applications/metadata/platform/api', ['read']),
      rule('applications/data/shared/*', ['read']),
      rule('applications/metadata/shared/*', ['read', 'list']),
      rule('applications/data/*', ['read']),
      rule('applications/metadata/*', ['read', 'list']),
    ]);

    expect(result.targets.map(({ id }) => id)).toEqual([
      'applications:folder:',
      'applications:secret:platform/api',
      'applications:folder:shared',
    ]);
  });

  it('uses the longest known prefix for nested KV mounts', () => {
    const result = deriveManagedKvTargets(
      ['team', 'team/applications'],
      [
        rule('team/applications/data/payments/*', ['read']),
        rule('team/applications/metadata/payments/*', ['read', 'list']),
      ],
    );

    expect(result.targets).toEqual([expect.objectContaining({
      id: 'team/applications:folder:payments',
      mount: 'team/applications',
      path: 'payments',
      target: 'folder',
    })]);
  });

  it('keeps folder deny metadata roots from becoming false exact-secret targets', () => {
    const result = deriveManagedKvTargets(['applications'], [
      rule('applications/data/platform/*', ['deny']),
      rule('applications/metadata/platform/*', ['deny']),
      rule('applications/delete/platform/*', ['deny']),
      rule('applications/undelete/platform/*', ['deny']),
      rule('applications/destroy/platform/*', ['deny']),
      rule('applications/metadata/platform', ['deny']),
    ]);

    expect(result.targets).toEqual([expect.objectContaining({
      id: 'applications:folder:platform',
      target: 'folder',
    })]);
  });

  it('retains a coordinated exact deny as a secret target', () => {
    const result = deriveManagedKvTargets(['applications'], [
      rule('applications/data/platform', ['deny']),
      rule('applications/metadata/platform', ['deny']),
      rule('applications/delete/platform', ['deny']),
      rule('applications/undelete/platform', ['deny']),
      rule('applications/destroy/platform', ['deny']),
    ]);

    expect(result.targets).toEqual([expect.objectContaining({
      id: 'applications:secret:platform',
      target: 'secret',
    })]);
  });

  it('retains custom substantive endpoint access', () => {
    const result = deriveManagedKvTargets(['applications'], [
      rule('applications/metadata/platform/*', ['list']),
      rule('applications/destroy/platform/api', ['update']),
    ]);

    expect(result.targets.map(({ id }) => id)).toEqual([
      'applications:folder:platform',
      'applications:secret:platform/api',
    ]);
  });

  it('reports unsafe, ambiguous, non-KV, and unsupported endpoint patterns', () => {
    const result = deriveManagedKvTargets(['applications'], [
      rule('applications/data/platform/+', ['read']),
      rule('applications/data/platform/config*', ['read']),
      rule('applications/database/platform', ['read']),
      rule('other/data/platform', ['read']),
      rule('applications/data/../platform', ['read']),
    ]);

    expect(result.targets).toEqual([]);
    expect(result.issues).toEqual([
      {
        pattern: 'applications/data/../platform',
        reason: 'unsafe-pattern',
      },
      {
        pattern: 'applications/data/platform/+',
        reason: 'unsupported-wildcard',
      },
      {
        pattern: 'applications/data/platform/config*',
        reason: 'unsupported-wildcard',
      },
      {
        pattern: 'applications/database/platform',
        reason: 'unsupported-endpoint',
      },
      {
        pattern: 'other/data/platform',
        reason: 'outside-kv-mount',
      },
    ]);
  });

  it('returns deterministic targets and patterns regardless of rule order', () => {
    const rules = [
      rule('/applications/metadata/platform/*', ['read', 'list']),
      rule('applications/data/platform/*', ['read']),
      rule('applications/data/platform/*', ['update']),
    ];

    expect(deriveManagedKvTargets(['applications/'], rules))
      .toEqual(deriveManagedKvTargets(['applications'], [...rules].reverse()));
  });
});
