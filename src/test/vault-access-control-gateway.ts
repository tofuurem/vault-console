import { vi } from 'vitest';

import type { VaultAccessControlGateway } from '@/domain/vault/contracts';

export function vaultAccessControlGatewayMock(
  overrides: Partial<VaultAccessControlGateway> = {},
): VaultAccessControlGateway {
  return {
    listAuthMounts: vi.fn(async () => []),
    listPolicies: vi.fn(async () => []),
    readPolicy: vi.fn(),
    writePolicy: vi.fn(async () => undefined),
    deletePolicy: vi.fn(async () => undefined),
    listGroups: vi.fn(async () => []),
    readGroup: vi.fn(),
    createGroup: vi.fn(),
    updateGroup: vi.fn(async () => undefined),
    deleteGroup: vi.fn(async () => undefined),
    updateGroupMembers: vi.fn(async () => undefined),
    listUserpassAccounts: vi.fn(async () => []),
    readUserpassAccount: vi.fn(async () => null),
    createUserpassAccount: vi.fn(async () => undefined),
    updateUserpassPolicies: vi.fn(async () => undefined),
    resetUserpassPassword: vi.fn(async () => undefined),
    deleteUserpassAccount: vi.fn(async () => undefined),
    listEntities: vi.fn(async () => []),
    readEntityByName: vi.fn(),
    readEntity: vi.fn(),
    lookupEntityByAlias: vi.fn(async () => null),
    createEntity: vi.fn(),
    updateEntity: vi.fn(async () => undefined),
    deleteEntity: vi.fn(async () => undefined),
    createEntityAlias: vi.fn(),
    deleteEntityAlias: vi.fn(async () => undefined),
    getCapabilities: vi.fn(async () => ({})),
    ...overrides,
  };
}
