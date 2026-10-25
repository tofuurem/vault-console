import { vi } from 'vitest';

import type { VaultSessionContextValue } from '@/application/vault/VaultSessionContext';
import type { VaultSession } from '@/domain/vault/contracts';
import { vaultToken } from '@/domain/vault/sensitive-value';

export const testVaultSession: VaultSession = {
  serverUrl: 'https://vault.example.test',
  token: vaultToken('hvs.reader'),
  authMethod: 'token',
  displayName: 'reader',
};

/** An authenticated session context for components rendered without the provider. */
export function vaultSessionContextValue(
  overrides: Partial<VaultSessionContextValue> = {},
): VaultSessionContextValue {
  return {
    status: 'authenticated',
    session: testVaultSession,
    health: { initialized: true, sealed: false, standby: false, version: '1.21.3' },
    capabilities: {},
    capabilityDiscovery: 'ready',
    accessControlPermission: { state: 'allowed' },
    sessionPersistenceAvailable: true,
    renewal: { status: 'idle' },
    revocation: { status: 'idle' },
    checkHealth: vi.fn(),
    queryCapabilities: vi.fn(),
    permissionFor: vi.fn(() => ({ state: 'allowed' as const })),
    signInWithToken: vi.fn(),
    signInWithUserpass: vi.fn(),
    renewSession: vi.fn(),
    revokeSession: vi.fn(),
    expireSession: vi.fn(),
    signOut: vi.fn(),
    ...overrides,
  };
}
