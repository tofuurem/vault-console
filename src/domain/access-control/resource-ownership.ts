import { parseManagedPolicyHcl } from './managed-resources';
import { USER_POLICY_PREFIX } from './policy-ownership';

export type IdentityOwnership = 'managed' | 'external';

export function assessIdentityOwnership(
  metadata: Readonly<Record<string, string>> | undefined,
): IdentityOwnership {
  return metadata?.managed_by === 'vault-console' ? 'managed' : 'external';
}

export interface LegacyUserPolicyEvidence {
  readonly policyName: string;
  readonly username: string;
  readonly hcl: string;
  readonly entityManaged: boolean;
  readonly attachedToUser: boolean;
  readonly referencedElsewhere: boolean;
  readonly visibilityComplete: boolean;
}

export function isLegacyUserPolicyCandidate(evidence: LegacyUserPolicyEvidence): boolean {
  return evidence.policyName === `${USER_POLICY_PREFIX}${evidence.username}`
    && evidence.entityManaged
    && evidence.attachedToUser
    && !evidence.referencedElsewhere
    && evidence.visibilityComplete
    && parseManagedPolicyHcl(evidence.hcl) !== null;
}
