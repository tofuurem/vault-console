import { createContext, useContext } from 'react';

import type {
  VaultCapabilityMap,
  VaultHealth,
  VaultSession,
} from '@/domain/vault/contracts';
import type { VaultError } from '@/domain/vault/errors';

export type VaultSessionStatus = 'anonymous' | 'authenticating' | 'authenticated' | 'expired';

export interface UserpassCredentials {
  readonly serverUrl: string;
  readonly mount: string;
  readonly username: string;
  readonly password: string;
}

export interface VaultSessionContextValue {
  readonly status: VaultSessionStatus;
  readonly session?: VaultSession;
  readonly health?: VaultHealth;
  readonly capabilities: VaultCapabilityMap;
  readonly canManageAccess: boolean;
  readonly error?: VaultError;
  checkHealth(serverUrl: string, signal?: AbortSignal): Promise<VaultHealth>;
  queryCapabilities(paths: readonly string[], signal?: AbortSignal): Promise<VaultCapabilityMap>;
  signInWithToken(serverUrl: string, rawToken: string, signal?: AbortSignal): Promise<void>;
  signInWithUserpass(credentials: UserpassCredentials, signal?: AbortSignal): Promise<void>;
  expireSession(): void;
  signOut(): void;
}

export const VaultSessionContext = createContext<VaultSessionContextValue | null>(null);

export function useVaultSession(): VaultSessionContextValue {
  const context = useContext(VaultSessionContext);
  if (!context) throw new Error('useVaultSession must be used inside VaultSessionProvider');
  return context;
}
