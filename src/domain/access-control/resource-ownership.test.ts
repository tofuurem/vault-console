import { describe, expect, it } from 'vitest';

import {
  assessIdentityOwnership,
  isLegacyUserPolicyCandidate,
} from './resource-ownership';

const SUPPORTED_POLICY = `path "applications/data/team/*" {
  capabilities = ["read"]
}`;

describe('identity and legacy access resource ownership', () => {
  it('trusts only the explicit Vault Console identity metadata marker', () => {
    expect(assessIdentityOwnership({
      managed_by: 'vault-console',
      schema: '1',
    })).toBe('managed');
    expect(assessIdentityOwnership({ managed_by: 'other-console' })).toBe('external');
    expect(assessIdentityOwnership(undefined)).toBe('external');
  });

  it('accepts a 0.5.0 per-user policy only with a complete unique ownership proof', () => {
    expect(isLegacyUserPolicyCandidate({
      policyName: 'vc-user-alice',
      username: 'alice',
      hcl: SUPPORTED_POLICY,
      entityManaged: true,
      attachedToUser: true,
      referencedElsewhere: false,
      visibilityComplete: true,
    })).toBe(true);
  });

  it.each([
    ['wrong name', { policyName: 'vc-user-bob' }],
    ['external entity', { entityManaged: false }],
    ['not attached', { attachedToUser: false }],
    ['shared policy', { referencedElsewhere: true }],
    ['partial visibility', { visibilityComplete: false }],
    ['unsupported HCL', { hcl: 'path "secret/*" { capabilities = ["read"] }\nfoo = "bar"' }],
  ])('rejects a legacy candidate with %s', (_label, override) => {
    expect(isLegacyUserPolicyCandidate({
      policyName: 'vc-user-alice',
      username: 'alice',
      hcl: SUPPORTED_POLICY,
      entityManaged: true,
      attachedToUser: true,
      referencedElsewhere: false,
      visibilityComplete: true,
      ...override,
    })).toBe(false);
  });
});
