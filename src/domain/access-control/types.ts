export const VAULT_CAPABILITIES = [
  'create',
  'read',
  'update',
  'patch',
  'delete',
  'list',
  'sudo',
  'subscribe',
  'recover',
  'deny',
] as const;

export type VaultCapability = (typeof VAULT_CAPABILITIES)[number];

export type PolicySourceKind = 'policy' | 'group' | 'role' | 'user-rule' | 'external-policy';

export interface PolicySource {
  readonly kind: PolicySourceKind;
  readonly id: string;
  readonly label: string;
  readonly via?: string;
}

export interface PolicyRule {
  readonly pattern: string;
  readonly capabilities: readonly VaultCapability[];
  readonly source: PolicySource;
}

export interface ResolvedPolicyAccess {
  readonly requestPath: string;
  readonly matchedPattern: string | null;
  readonly capabilities: readonly VaultCapability[];
  readonly denied: boolean;
  readonly sources: readonly PolicySource[];
  readonly capabilitySources: Readonly<Partial<Record<VaultCapability, readonly PolicySource[]>>>;
}
