import { describe, expect, it } from 'vitest';

import {
  assessPlanRisk,
  capabilityRequirementsSatisfied,
  permissionDiff,
  snapshotFingerprint,
  sortChangeOperations,
} from './change-plan';
import type { ChangeOperation } from './model';

function operation(
  id: string,
  dependsOn: readonly string[] = [],
  overrides: Partial<ChangeOperation> = {},
): ChangeOperation {
  return {
    id,
    kind: 'delete-policy',
    label: id,
    dependsOn,
    requirements: [],
    effectTiming: 'destructive-cleanup',
    risk: 'normal',
    policyName: id,
    ...overrides,
  } as ChangeOperation;
}

describe('access lifecycle ChangePlan domain', () => {
  it('fingerprints object keys deterministically while preserving meaningful array order', () => {
    expect(snapshotFingerprint({
      account: { username: 'alice', policies: ['default', 'reader'] },
      entity: { disabled: false },
    })).toBe(snapshotFingerprint({
      entity: { disabled: false },
      account: { policies: ['default', 'reader'], username: 'alice' },
    }));
    expect(snapshotFingerprint({ policies: ['default', 'reader'] })).not.toBe(
      snapshotFingerprint({ policies: ['reader', 'default'] }),
    );
  });

  it('orders operations deterministically from their dependency graph', () => {
    const sorted = sortChangeOperations([
      operation('cleanup', ['detach']),
      operation('attach', ['definition']),
      operation('definition'),
      operation('detach'),
    ]);

    expect(sorted.map(({ id }) => id)).toEqual([
      'definition',
      'detach',
      'cleanup',
      'attach',
    ]);
  });

  it('rejects missing dependencies, duplicate IDs, and cycles', () => {
    expect(() => sortChangeOperations([
      operation('a'),
      operation('a'),
    ])).toThrow(/duplicate/i);
    expect(() => sortChangeOperations([
      operation('a', ['missing']),
    ])).toThrow(/missing/i);
    expect(() => sortChangeOperations([
      operation('a', ['b']),
      operation('b', ['a']),
    ])).toThrow(/cycle/i);
  });

  it('computes a stable semantic capability diff', () => {
    expect(permissionDiff(
      [
        { pattern: 'secret/data/apps/*', capabilities: ['read', 'update'] },
        { pattern: 'secret/metadata/apps/*', capabilities: ['list'] },
      ],
      [
        { pattern: 'secret/data/apps/*', capabilities: ['read', 'delete'] },
        { pattern: 'secret/metadata/apps/*', capabilities: ['list'] },
      ],
    )).toEqual({
      added: [{ pattern: 'secret/data/apps/*', capability: 'delete' }],
      removed: [{ pattern: 'secret/data/apps/*', capability: 'update' }],
    });
  });

  it('accepts any requested capability or root and reports missing paths', () => {
    const requirements = [
      { path: 'sys/policies/acl/vc-role-reader', anyOf: ['create', 'update'] as const },
      { path: 'identity/group/id/group-1', anyOf: ['update'] as const },
    ];

    expect(capabilityRequirementsSatisfied(requirements, {
      'sys/policies/acl/vc-role-reader': ['update'],
      'identity/group/id/group-1': ['root'],
    })).toEqual({ allowed: true, missing: [] });
    expect(capabilityRequirementsSatisfied(requirements, {
      'sys/policies/acl/vc-role-reader': ['read'],
      'identity/group/id/group-1': ['update'],
    })).toEqual({
      allowed: false,
      missing: [requirements[0]],
    });
  });

  it('requires typed confirmation for broad, destructive, or Owner-level grants', () => {
    expect(assessPlanRisk({
      resourceId: 'vc-role-owner',
      operations: [operation('write', [], {
        kind: 'write-policy',
        policy: { name: 'vc-role-owner', policy: 'body' },
        created: false,
        risk: 'typed-confirmation',
        effectTiming: 'next-request',
      })],
      permissionDiff: {
        added: [
          { pattern: 'secret/destroy/*', capability: 'update' },
          { pattern: 'secret/metadata/*', capability: 'delete' },
        ],
        removed: [],
      },
    })).toEqual({
      required: true,
      value: 'vc-role-owner',
      reasons: [
        'The plan includes a high-risk operation.',
        'The plan grants permanent delete or destroy access.',
      ],
    });

    expect(assessPlanRisk({
      resourceId: 'group-readers',
      operations: [operation('group-update', [], {
        kind: 'update-group',
        groupId: 'group-readers',
        group: {
          name: 'Readers',
          policies: [],
          memberEntityIds: [],
          memberGroupIds: [],
          metadata: {},
        },
        effectTiming: 'next-request',
      })],
      permissionDiff: { added: [], removed: [] },
    })).toBeUndefined();
  });
});
