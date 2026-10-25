import type { VaultPolicyCapability } from '@/domain/vault/capabilities';

export { VAULT_POLICY_CAPABILITIES, type VaultPolicyCapability } from '@/domain/vault/capabilities';

export type PolicySourceKind = 'policy' | 'group' | 'role' | 'user-rule' | 'external-policy';

export interface PolicySource {
  readonly kind: PolicySourceKind;
  readonly id: string;
  readonly label: string;
  readonly via?: string;
}

export interface PolicyRule {
  readonly pattern: string;
  readonly capabilities: readonly VaultPolicyCapability[];
  readonly source: PolicySource;
}

export interface ResolvedPolicyAccess {
  readonly requestPath: string;
  readonly matchedPattern: string | null;
  readonly capabilities: readonly VaultPolicyCapability[];
  readonly denied: boolean;
  readonly sources: readonly PolicySource[];
  readonly capabilitySources: Readonly<Partial<Record<VaultPolicyCapability, readonly PolicySource[]>>>;
}
