import { useCallback, useState } from 'react';

import { normalizeVaultError, type VaultError } from '@/domain/vault/errors';
import { useSealGateway } from './SealGatewayContext';
import { useVaultSession } from './VaultSessionContext';

export type SealPermission = 'checking' | 'allowed' | 'denied' | 'unknown';

export interface SealVaultState {
  readonly permission: SealPermission;
  readonly sealing: boolean;
  readonly error?: VaultError;
  checkPermission(signal?: AbortSignal): Promise<void>;
  seal(): Promise<boolean>;
}

/** Emergency seal for operators with `sudo` on `sys/seal`. */
export function useSealVault(): SealVaultState {
  const gateway = useSealGateway();
  const vault = useVaultSession();
  const { session, queryCapabilities } = vault;
  const [permission, setPermission] = useState<SealPermission>('checking');
  const [sealing, setSealing] = useState(false);
  const [error, setError] = useState<VaultError>();

  const checkPermission = useCallback(async (signal?: AbortSignal) => {
    setPermission('checking');
    try {
      const capabilities = (await queryCapabilities(['sys/seal'], signal))['sys/seal'] ?? [];
      const allowed = capabilities.includes('root')
        || (capabilities.includes('sudo') && capabilities.includes('update'));
      setPermission(allowed ? 'allowed' : 'denied');
    } catch (cause) {
      if (normalizeVaultError(cause).code === 'aborted') return;
      setPermission('unknown');
    }
  }, [queryCapabilities]);

  const seal = useCallback(async () => {
    if (!session) return false;
    setSealing(true);
    setError(undefined);
    try {
      await gateway.seal(session);
      return true;
    } catch (cause) {
      setError(normalizeVaultError(cause));
      return false;
    } finally {
      setSealing(false);
    }
  }, [gateway, session]);

  return { permission, sealing, error, checkPermission, seal };
}
