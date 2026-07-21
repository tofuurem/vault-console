import type { AccessPolicyRule } from './effective-access';
import type { VaultCapability } from './types';

export const ROLE_POLICY_PREFIX = 'vc-role-';
export const USER_POLICY_PREFIX = 'vc-user-';

export type ManagedPolicyKind = 'role' | 'user-direct' | 'external';

export function classifyPolicyName(name: string): ManagedPolicyKind {
  if (name.startsWith(ROLE_POLICY_PREFIX)) return 'role';
  if (name.startsWith(USER_POLICY_PREFIX)) return 'user-direct';
  return 'external';
}

export function managedRoleName(policyName: string): string {
  const slug = policyName.replace(new RegExp(`^${ROLE_POLICY_PREFIX}`), '');
  return slug.split('-').filter(Boolean).map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`).join(' ');
}

const POLICY_BLOCK = /path\s+"([^"]+)"\s*\{\s*capabilities\s*=\s*\[([^\]]*)\]\s*\}/g;
const CAPABILITY = /"(create|read|update|patch|delete|list|sudo|deny)"/g;

export function parseManagedPolicyHcl(hcl: string): readonly AccessPolicyRule[] | null {
  const rules: AccessPolicyRule[] = [];
  POLICY_BLOCK.lastIndex = 0;
  let block: RegExpExecArray | null;
  while ((block = POLICY_BLOCK.exec(hcl)) !== null) {
    const capabilities = Array.from(block[2].matchAll(CAPABILITY), (match) => match[1] as VaultCapability);
    if (capabilities.length === 0) return null;
    rules.push({ pattern: block[1], capabilities });
  }
  return rules.length > 0 ? rules : null;
}
