import {
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type RefObject,
  type SetStateAction,
} from 'react';

import type {
  VaultCapabilityMap,
  VaultHealth,
  VaultSession,
} from '@/domain/vault/contracts';
import type { VaultError } from '@/domain/vault/errors';
import type { CapabilityDiscoveryState } from './capability-permissions';
import type { VaultSessionStorage } from './session-storage';
import type {
  VaultSessionRenewalState,
  VaultSessionRevocationState,
  VaultSessionStatus,
} from './VaultSessionContext';

export interface VaultSessionControls {
  readonly setStatus: Dispatch<SetStateAction<VaultSessionStatus>>;
  readonly setSession: Dispatch<SetStateAction<VaultSession | undefined>>;
  readonly setHealth: Dispatch<SetStateAction<VaultHealth | undefined>>;
  readonly setCapabilities: Dispatch<SetStateAction<VaultCapabilityMap>>;
  readonly setCapabilityDiscovery: Dispatch<SetStateAction<CapabilityDiscoveryState>>;
  readonly setSessionPersistenceAvailable: Dispatch<SetStateAction<boolean>>;
  readonly setError: Dispatch<SetStateAction<VaultError | undefined>>;
  readonly setRenewal: Dispatch<SetStateAction<VaultSessionRenewalState>>;
  readonly setRevocation: Dispatch<SetStateAction<VaultSessionRevocationState>>;
  readonly sessionRef: RefObject<VaultSession | undefined>;
  readonly renewalPromiseRef: RefObject<Promise<void> | null>;
  readonly renewalControllerRef: RefObject<AbortController | null>;
  readonly revocationPromiseRef: RefObject<Promise<void> | null>;
  readonly revocationControllerRef: RefObject<AbortController | null>;
}

export interface VaultSessionStateValues {
  readonly status: VaultSessionStatus;
  readonly session?: VaultSession;
  readonly health?: VaultHealth;
  readonly capabilities: VaultCapabilityMap;
  readonly capabilityDiscovery: CapabilityDiscoveryState;
  readonly sessionPersistenceAvailable: boolean;
  readonly error?: VaultError;
  readonly renewal: VaultSessionRenewalState;
  readonly revocation: VaultSessionRevocationState;
}

export function useVaultSessionState(tabSession: VaultSessionStorage): {
  readonly values: VaultSessionStateValues;
  readonly controls: VaultSessionControls;
} {
  const [initialSession] = useState(() => tabSession.load());
  const [status, setStatus] = useState<VaultSessionStatus>(
    initialSession.session ? 'restoring' : 'anonymous',
  );
  const [session, setSession] = useState<VaultSession | undefined>(initialSession.session);
  const [health, setHealth] = useState<VaultHealth>();
  const [capabilities, setCapabilities] = useState<VaultCapabilityMap>({});
  const [capabilityDiscovery, setCapabilityDiscovery] = useState<CapabilityDiscoveryState>(
    initialSession.session ? 'loading' : 'idle',
  );
  const [sessionPersistenceAvailable, setSessionPersistenceAvailable] = useState(
    initialSession.available,
  );
  const [error, setError] = useState<VaultError>();
  const [renewal, setRenewal] = useState<VaultSessionRenewalState>({ status: 'idle' });
  const [revocation, setRevocation] = useState<VaultSessionRevocationState>({ status: 'idle' });
  const sessionRef = useRef(session);
  const renewalPromiseRef = useRef<Promise<void> | null>(null);
  const renewalControllerRef = useRef<AbortController | null>(null);
  const revocationPromiseRef = useRef<Promise<void> | null>(null);
  const revocationControllerRef = useRef<AbortController | null>(null);
  sessionRef.current = session;

  const controls = useMemo<VaultSessionControls>(() => ({
    setStatus,
    setSession,
    setHealth,
    setCapabilities,
    setCapabilityDiscovery,
    setSessionPersistenceAvailable,
    setError,
    setRenewal,
    setRevocation,
    sessionRef,
    renewalPromiseRef,
    renewalControllerRef,
    revocationPromiseRef,
    revocationControllerRef,
  }), []);

  return {
    values: {
      status,
      session,
      health,
      capabilities,
      capabilityDiscovery,
      sessionPersistenceAvailable,
      error,
      renewal,
      revocation,
    },
    controls,
  };
}
