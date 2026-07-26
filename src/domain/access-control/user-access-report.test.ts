import { describe, expect, it } from 'vitest';

import type { AccessPolicyRule } from './effective-access';
import {
  buildUserAccessReport,
  type UserAccessPolicy,
  type UserAccessPolicyAttachment,
  type UserAccessReportInput,
} from './user-access-report';

const account = {
  username: 'alice',
  mount: 'userpass',
  mountAccessor: 'auth_userpass_123',
};

function attachment(
  policyName: string,
  origin: UserAccessPolicyAttachment['origin'] = { kind: 'direct' },
): UserAccessPolicyAttachment {
  return { policyName, origin };
}

function policy(
  name: string,
  rules: readonly AccessPolicyRule[],
  kind: UserAccessPolicy['kind'] = 'role',
): UserAccessPolicy {
  return { name, kind, status: 'resolved', rules };
}

function input(
  overrides: Partial<UserAccessReportInput> = {},
): UserAccessReportInput {
  return {
    account,
    mounts: ['applications'],
    identity: { status: 'absent' },
    groups: { status: 'not-applicable' },
    attachments: [],
    policies: [],
    ...overrides,
  };
}

const viewRules: readonly AccessPolicyRule[] = [
  { pattern: 'applications/data/platform/*', capabilities: ['read'] },
  { pattern: 'applications/metadata/platform/*', capabilities: ['read', 'list'] },
  { pattern: 'applications/metadata', capabilities: ['list'] },
  { pattern: 'applications/metadata/platform', capabilities: ['list'] },
];

describe('buildUserAccessReport', () => {
  it('resolves a direct managed role with endpoint provenance', () => {
    const report = buildUserAccessReport(input({
      attachments: [attachment('vc-role-platform-readers')],
      policies: [policy('vc-role-platform-readers', viewRules)],
    }));

    expect(report.completeness).toEqual({ state: 'complete', reasons: [] });
    expect(report.sources).toEqual([expect.objectContaining({
      policyName: 'vc-role-platform-readers',
      policyKind: 'role',
      resolution: 'resolved',
      source: {
        kind: 'role',
        id: 'vc-role-platform-readers',
        label: 'Platform Readers',
      },
    })]);
    expect(report.targets).toEqual([expect.objectContaining({
      id: 'applications:folder:platform',
      mount: 'applications',
      path: 'platform',
      target: 'folder',
      level: 'view',
    })]);
    expect(report.targets[0].endpointAccess.data.capabilitySources.read).toEqual([
      {
        kind: 'role',
        id: 'vc-role-platform-readers',
        label: 'Platform Readers',
      },
    ]);
  });

  it('retains group to role to policy provenance', () => {
    const report = buildUserAccessReport(input({
      identity: {
        status: 'available',
        entity: {
          id: 'entity-alice',
          displayName: 'Alice',
          disabled: false,
          aliasId: 'alias-alice',
        },
      },
      groups: { status: 'available' },
      attachments: [attachment('vc-role-platform-readers', {
        kind: 'group',
        groupId: 'platform-team',
        groupName: 'Platform team',
      })],
      policies: [policy('vc-role-platform-readers', viewRules)],
    }));

    expect(report.targets[0].sources).toEqual([{
      kind: 'group',
      id: 'platform-team',
      label: 'Platform team',
      via: 'Platform Readers',
    }]);
    expect(report.sources[0].source).toEqual({
      kind: 'group',
      id: 'platform-team',
      label: 'Platform team',
      via: 'Platform Readers',
    });
  });

  it('keeps direct and group provenance when the same role is attached twice', () => {
    const report = buildUserAccessReport(input({
      identity: {
        status: 'available',
        entity: {
          id: 'entity-alice',
          displayName: 'Alice',
          disabled: false,
        },
      },
      groups: { status: 'available' },
      attachments: [
        attachment('vc-role-platform-readers'),
        attachment('vc-role-platform-readers', {
          kind: 'group',
          groupId: 'platform-team',
          groupName: 'Platform team',
        }),
      ],
      policies: [policy('vc-role-platform-readers', viewRules)],
    }));

    expect(report.targets[0].sources).toEqual([
      {
        kind: 'role',
        id: 'vc-role-platform-readers',
        label: 'Platform Readers',
      },
      {
        kind: 'group',
        id: 'platform-team',
        label: 'Platform team',
        via: 'Platform Readers',
      },
    ]);
  });

  it('resolves specific deny rules without losing the broader target', () => {
    const report = buildUserAccessReport(input({
      attachments: [
        attachment('vc-role-platform-readers'),
        attachment('vc-user-alice'),
      ],
      policies: [
        policy('vc-role-platform-readers', viewRules),
        policy('vc-user-alice', [
          { pattern: 'applications/data/platform/private/*', capabilities: ['deny'] },
          { pattern: 'applications/metadata/platform/private/*', capabilities: ['deny'] },
          { pattern: 'applications/delete/platform/private/*', capabilities: ['deny'] },
          { pattern: 'applications/undelete/platform/private/*', capabilities: ['deny'] },
          { pattern: 'applications/destroy/platform/private/*', capabilities: ['deny'] },
          { pattern: 'applications/metadata/platform/private', capabilities: ['deny'] },
        ], 'user-direct'),
      ],
    }));

    expect(report.targets.map(({ id, level }) => [id, level])).toEqual([
      ['applications:folder:platform', 'view'],
      ['applications:folder:platform/private', 'deny'],
    ]);
    expect(report.targets[1].sources).toContainEqual({
      kind: 'user-rule',
      id: 'vc-user-alice',
      label: 'vc-user-alice',
    });
  });

  it('marks external and unreadable policies unresolved without claiming access', () => {
    const report = buildUserAccessReport(input({
      attachments: [
        attachment('legacy-operator'),
        attachment('vc-role-unreadable'),
      ],
      policies: [
        {
          name: 'legacy-operator',
          kind: 'external',
          status: 'external',
        },
        {
          name: 'vc-role-unreadable',
          kind: 'role',
          status: 'unreadable',
        },
      ],
    }));

    expect(report.targets).toEqual([]);
    expect(report.completeness.state).toBe('partial-visibility');
    expect(report.unresolvedSources.map(({ policyName, reason }) => [
      policyName,
      reason,
    ])).toEqual([
      ['legacy-operator', 'external'],
      ['vc-role-unreadable', 'unreadable'],
    ]);
  });

  it('uses limited-by-policy for denied identity, groups, or policy sources', () => {
    const report = buildUserAccessReport(input({
      identity: { status: 'denied' },
      groups: { status: 'denied' },
      attachments: [attachment('vc-role-private')],
      policies: [{
        name: 'vc-role-private',
        kind: 'role',
        status: 'denied',
      }],
    }));

    expect(report.completeness.state).toBe('limited-by-policy');
    expect(report.completeness.reasons.map(({ source, reason }) => [
      source,
      reason,
    ])).toEqual([
      ['groups', 'denied'],
      ['identity', 'denied'],
      ['policy', 'denied'],
    ]);
  });

  it('keeps a denied external policy denied instead of claiming readable HCL', () => {
    const report = buildUserAccessReport(input({
      attachments: [attachment('legacy-private')],
      policies: [{
        name: 'legacy-private',
        kind: 'external',
        status: 'denied',
      }],
    }));

    expect(report.completeness.state).toBe('limited-by-policy');
    expect(report.unresolvedSources).toEqual([
      expect.objectContaining({
        policyName: 'legacy-private',
        resolution: 'denied',
        reason: 'denied',
      }),
    ]);
  });

  it('marks supported HCL with unsafe KV targets as partially representable', () => {
    const report = buildUserAccessReport(input({
      attachments: [attachment('vc-role-wildcard')],
      policies: [policy('vc-role-wildcard', [{
        pattern: 'applications/data/platform/+',
        capabilities: ['read'],
      }])],
    }));

    expect(report.targets).toEqual([]);
    expect(report.completeness.state).toBe('partial-visibility');
    expect(report.completeness.reasons).toContainEqual({
      source: 'policy-target',
      id: 'vc-role-wildcard',
      label: 'vc-role-wildcard',
      reason: 'unsupported',
    });
  });

  it('does not treat successfully absent identity as incomplete', () => {
    const report = buildUserAccessReport(input());

    expect(report.completeness).toEqual({ state: 'complete', reasons: [] });
  });

  it('returns deterministic output regardless of source completion order', () => {
    const first = input({
      identity: {
        status: 'available',
        entity: {
          id: 'entity-alice',
          displayName: 'Alice',
          disabled: false,
        },
      },
      groups: { status: 'available' },
      attachments: [
        attachment('vc-user-alice'),
        attachment('vc-role-platform-readers'),
      ],
      policies: [
        policy('vc-user-alice', [{
          pattern: 'applications/data/platform/api',
          capabilities: ['read'],
        }], 'user-direct'),
        policy('vc-role-platform-readers', viewRules),
      ],
    });
    const second = {
      ...first,
      attachments: [...first.attachments].reverse(),
      policies: [...first.policies].reverse(),
    };

    expect(buildUserAccessReport(first)).toEqual(buildUserAccessReport(second));
  });
});
