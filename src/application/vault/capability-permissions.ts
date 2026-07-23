import type {
  VaultCapability,
  VaultCapabilityMap,
} from '@/domain/vault/contracts';

export type CapabilityDiscoveryState = 'idle' | 'loading' | 'ready' | 'unavailable';

export type PermissionDecision =
  | { readonly state: 'allowed' }
  | { readonly state: 'denied'; readonly reason: string }
  | { readonly state: 'unknown'; readonly reason: string };

const UNKNOWN_REASON = 'Vault capability discovery is unavailable for this token.';

function requiredCapabilities(
  required: VaultCapability | readonly VaultCapability[],
): readonly VaultCapability[] {
  return typeof required === 'string' ? [required] : required;
}

export function resolvePermission(
  capabilities: VaultCapabilityMap,
  discovery: CapabilityDiscoveryState,
  path: string,
  required: VaultCapability | readonly VaultCapability[],
): PermissionDecision {
  if (discovery !== 'ready') return { state: 'unknown', reason: UNKNOWN_REASON };
  const actual = capabilities[path];
  if (!actual) return { state: 'unknown', reason: `Capabilities for ${path} were not returned by Vault.` };
  if (actual.includes('deny')) return { state: 'denied', reason: `Vault policy denies ${path}.` };
  if (actual.includes('root')) return { state: 'allowed' };
  const needed = requiredCapabilities(required);
  if (needed.every((capability) => actual.includes(capability))) return { state: 'allowed' };
  return {
    state: 'denied',
    reason: `Vault policy does not grant ${needed.join(' + ')} on ${path}.`,
  };
}

export function resolveAccessControlPermission(
  capabilities: VaultCapabilityMap,
  discovery: CapabilityDiscoveryState,
): PermissionDecision {
  if (discovery !== 'ready') return { state: 'unknown', reason: UNKNOWN_REASON };
  const decisions = [
    resolvePermission(capabilities, discovery, 'sys/auth', 'read'),
    resolvePermission(capabilities, discovery, 'sys/policy', ['read', 'list']),
    resolvePermission(capabilities, discovery, 'identity/group/id', 'list'),
    resolvePermission(capabilities, discovery, 'identity/entity/id', 'list'),
  ];
  if (decisions.some((decision) => decision.state === 'allowed')) return { state: 'allowed' };
  if (decisions.every((decision) => decision.state === 'denied')) {
    return { state: 'denied', reason: 'Vault policy does not allow access-control discovery.' };
  }
  return { state: 'unknown', reason: 'Some access-control capabilities could not be determined.' };
}
