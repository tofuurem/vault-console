import { describe, expect, it } from 'vitest';

import { snapshotFingerprint } from '@/domain/access-control/lifecycle/change-plan';
import type {
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultUserpassAccount,
} from '@/domain/vault/contracts';
import {
  canonicalDependencies,
  canonicalIdentityGroup,
  identityEntityFingerprint,
  userpassAccountFingerprint,
} from './snapshot-normalization';

describe('Vault lifecycle snapshot normalization', () => {
  it('treats userpass policies and bound CIDRs as unordered sets', () => {
    const account: VaultUserpassAccount = {
      username: 'alice',
      mount: 'userpass',
      tokenPolicies: ['reader', 'default'],
      tokenBoundCidrs: ['10.0.0.0/8', '127.0.0.1/32'],
    };
    const reordered: VaultUserpassAccount = {
      ...account,
      tokenPolicies: ['default', 'reader'],
      tokenBoundCidrs: ['127.0.0.1/32', '10.0.0.0/8'],
    };

    expect(userpassAccountFingerprint(account))
      .toBe(userpassAccountFingerprint(reordered));
  });

  it('treats entity policies, memberships, and aliases as unordered sets', () => {
    const entity: VaultIdentityEntity = {
      id: 'entity-alice',
      name: 'Alice',
      disabled: false,
      policies: ['reader', 'default'],
      groupIds: ['group-b', 'group-a'],
      aliases: [
        {
          id: 'alias-b',
          name: 'alice',
          canonicalId: 'entity-alice',
          mountAccessor: 'auth_userpass_b',
        },
        {
          id: 'alias-a',
          name: 'alice',
          canonicalId: 'entity-alice',
          mountAccessor: 'auth_userpass_a',
        },
      ],
    };
    const reordered: VaultIdentityEntity = {
      ...entity,
      policies: [...entity.policies].reverse(),
      groupIds: [...entity.groupIds].reverse(),
      aliases: [...entity.aliases].reverse(),
    };

    expect(identityEntityFingerprint(entity))
      .toBe(identityEntityFingerprint(reordered));
  });

  it('canonicalizes groups and dependencies without weakening ordered fingerprints', () => {
    const group: VaultIdentityGroup = {
      id: 'group-platform',
      name: 'Platform',
      policies: ['writer', 'reader'],
      memberEntityIds: ['entity-b', 'entity-a'],
      memberGroupIds: ['group-b', 'group-a'],
      metadata: {},
    };

    expect(canonicalIdentityGroup(group)).toMatchObject({
      policies: ['reader', 'writer'],
      memberEntityIds: ['entity-a', 'entity-b'],
      memberGroupIds: ['group-a', 'group-b'],
    });
    expect(canonicalDependencies([
      { kind: 'user', id: 'entity-b', name: 'B' },
      { kind: 'group', id: 'group-a', name: 'A' },
    ])).toEqual([
      { kind: 'group', id: 'group-a', name: 'A' },
      { kind: 'user', id: 'entity-b', name: 'B' },
    ]);
    expect(snapshotFingerprint(['a', 'b']))
      .not.toBe(snapshotFingerprint(['b', 'a']));
  });
});
