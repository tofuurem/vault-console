import { describe, expect, it } from 'vitest';

import {
  resolveSecretAccess,
  secretAccessEndpoints,
  type SecretAccessGroup,
  type SecretAccessInput,
  type SecretAccessPolicy,
  type SecretAccessUser,
} from './secret-access';

const policies: readonly SecretAccessPolicy[] = [
  {
    name: 'vc-role-billing-reader',
    status: 'resolved',
    rules: [
      { pattern: 'applications/data/billing/*', capabilities: ['read'] },
      { pattern: 'applications/metadata/billing', capabilities: ['list'] },
    ],
  },
  {
    name: 'vc-role-billing-owner',
    status: 'resolved',
    rules: [
      { pattern: 'applications/data/billing/*', capabilities: ['create', 'read', 'update', 'delete'] },
      { pattern: 'applications/destroy/billing/*', capabilities: ['update'] },
    ],
  },
  {
    name: 'ops-break-glass',
    status: 'resolved',
    rules: [{ pattern: 'applications/data/*', capabilities: ['read'] }],
  },
  {
    name: 'deny-database',
    status: 'resolved',
    rules: [{ pattern: 'applications/data/billing/database', capabilities: ['deny'] }],
  },
  { name: 'default', status: 'resolved', rules: [{ pattern: 'auth/token/lookup-self', capabilities: ['read'] }] },
  { name: 'legacy-hcl', status: 'unsupported' },
  { name: 'ghost', status: 'missing' },
];

const groups: readonly SecretAccessGroup[] = [
  { id: 'g-billing', name: 'billing', policies: ['vc-role-billing-reader'], memberEntityIds: ['e-alice'], memberGroupIds: [] },
  { id: 'g-eng', name: 'engineering', policies: ['vc-role-billing-owner'], memberEntityIds: [], memberGroupIds: ['g-platform'] },
  { id: 'g-platform', name: 'platform', policies: [], memberEntityIds: ['e-bob'], memberGroupIds: [] },
];

function user(username: string, overrides: Partial<SecretAccessUser> = {}): SecretAccessUser {
  return {
    username,
    mount: 'userpass',
    tokenPolicies: [],
    noDefaultPolicy: false,
    identity: { status: 'absent' },
    ...overrides,
  };
}

function input(overrides: Partial<SecretAccessInput> = {}): SecretAccessInput {
  return {
    mount: 'applications',
    path: 'billing/database',
    users: [],
    groups,
    rolePolicyNames: ['vc-role-billing-reader', 'vc-role-billing-owner'],
    policies,
    gaps: [],
    ...overrides,
  };
}

describe('resolveSecretAccess', () => {
  it('derives the exact KV v2 request paths for one secret', () => {
    expect(secretAccessEndpoints('applications/', '/billing/database')).toEqual({
      data: 'applications/data/billing/database',
      delete: 'applications/delete/billing/database',
      destroy: 'applications/destroy/billing/database',
      list: ['applications/metadata/billing', 'applications/metadata/billing/'],
    });
    expect(secretAccessEndpoints('kv', 'root-secret').list).toEqual(['kv/metadata', 'kv/metadata/']);
  });

  it('maps users to capabilities with direct, group, and nested-group provenance', () => {
    const report = resolveSecretAccess(input({
      users: [
        user('alice', {
          identity: { status: 'available', entity: { id: 'e-alice', name: 'alice', disabled: false, policies: [], groupIds: [] } },
        }),
        user('bob', {
          identity: { status: 'available', entity: { id: 'e-bob', name: 'bob', disabled: false, policies: [], groupIds: [] } },
        }),
        user('carol', { tokenPolicies: ['ops-break-glass'] }),
        user('dave'),
      ],
    }));

    expect(report.completeness).toEqual({ state: 'complete', gaps: [] });
    expect(report.users.map((subject) => [subject.label, subject.capabilities])).toEqual([
      ['alice', ['read', 'list']],
      ['bob', ['read', 'write', 'delete', 'destroy']],
      ['carol', ['read']],
    ]);
    expect(report.users[0].via).toEqual([{
      kind: 'group',
      groupId: 'g-billing',
      groupName: 'billing',
      policyName: 'vc-role-billing-reader',
      roleName: 'Billing Reader',
    }]);
    expect(report.users[1].via).toEqual([expect.objectContaining({ kind: 'group', groupName: 'engineering' })]);
    expect(report.users[2].via).toEqual([{ kind: 'policy', policyName: 'ops-break-glass' }]);
  });

  it('applies the most specific pattern across all attached policies, including deny', () => {
    const report = resolveSecretAccess(input({
      users: [user('erin', { tokenPolicies: ['vc-role-billing-owner', 'deny-database'] })],
    }));
    // A deny on the data endpoint does not cover the separate destroy endpoint.
    expect(report.users.map((subject) => subject.capabilities)).toEqual([['destroy']]);

    const sameRoot = resolveSecretAccess(input({
      users: [user('frank', { tokenPolicies: ['ops-break-glass', 'vc-role-billing-reader'] })],
    }));
    expect(sameRoot.users[0].capabilities).toEqual(['read', 'list']);
    expect(sameRoot.users[0].via).toEqual([
      { kind: 'role', policyName: 'vc-role-billing-reader', roleName: 'Billing Reader' },
    ]);
  });

  it('includes groups with inherited parent policies and managed roles', () => {
    const report = resolveSecretAccess(input());
    expect(report.groups.map((subject) => [subject.label, subject.capabilities])).toEqual([
      ['billing', ['read', 'list']],
      ['engineering', ['read', 'write', 'delete', 'destroy']],
      ['platform', ['read', 'write', 'delete', 'destroy']],
    ]);
    expect(report.groups[2].via).toEqual([expect.objectContaining({ kind: 'group', groupId: 'g-eng' })]);
    expect(report.roles.map((subject) => subject.label)).toEqual(['Billing Owner', 'Billing Reader']);
  });

  it('reports incomplete subjects and gaps honestly without treating missing policies as gaps', () => {
    const report = resolveSecretAccess(input({
      users: [
        user('gina', { tokenPolicies: ['vc-role-billing-reader', 'legacy-hcl', 'ghost'] }),
        user('hank', { tokenPolicies: ['legacy-hcl'] }),
        user('ivy', { identity: { status: 'unknown' } }),
      ],
      gaps: [{ source: 'entities', reason: 'denied' }],
    }));

    expect(report.users).toEqual([expect.objectContaining({
      label: 'gina',
      capabilities: ['read', 'list'],
      unresolvedPolicies: ['legacy-hcl'],
      incomplete: true,
    })]);
    expect(report.unverified.map((subject) => subject.label)).toEqual(['hank', 'ivy']);
    expect(report.completeness.state).toBe('partial');
    expect(report.completeness.gaps).toEqual([
      { source: 'entities', reason: 'denied' },
      { source: 'policy', id: 'legacy-hcl', reason: 'unsupported' },
    ]);
  });

  it('marks users with an identity as incomplete when groups are unreadable and skips disabled identities', () => {
    const report = resolveSecretAccess(input({
      groups: [],
      users: [
        user('jack', {
          tokenPolicies: ['ops-break-glass'],
          identity: { status: 'available', entity: { id: 'e-jack', name: 'jack', disabled: false, policies: [], groupIds: [] } },
        }),
        user('kate', {
          tokenPolicies: ['ops-break-glass'],
          identity: { status: 'available', entity: { id: 'e-kate', name: 'kate', disabled: true, policies: [], groupIds: [] } },
        }),
      ],
      gaps: [{ source: 'groups', reason: 'unavailable' }],
    }));
    expect(report.users.map((subject) => [subject.label, subject.membershipUnknown])).toEqual([['jack', true]]);
  });

  it('adds the implicit default policy unless the user opts out of it', () => {
    const report = resolveSecretAccess(input({
      policies: [...policies.filter((policy) => policy.name !== 'default'), { name: 'default', status: 'denied' }],
      users: [user('lena'), user('mike', { noDefaultPolicy: true })],
    }));
    expect(report.unverified.map((subject) => [subject.label, subject.unresolvedPolicies])).toEqual([
      ['lena', ['default']],
    ]);
  });
});
