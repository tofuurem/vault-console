/** Capabilities that may appear in an ACL policy `capabilities` list. */
export const VAULT_POLICY_CAPABILITIES = [
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

export type VaultPolicyCapability = (typeof VAULT_POLICY_CAPABILITIES)[number];

/**
 * Capabilities reported by `sys/capabilities-self`, which additionally
 * reports `root` for root tokens.
 */
export type VaultCapability = VaultPolicyCapability | 'root';

const REPORTED_CAPABILITIES: ReadonlySet<string> = new Set<VaultCapability>([
  ...VAULT_POLICY_CAPABILITIES,
  'root',
]);

export function isVaultCapability(value: string): value is VaultCapability {
  return REPORTED_CAPABILITIES.has(value);
}
