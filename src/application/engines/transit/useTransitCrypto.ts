import { useMutation } from '@tanstack/react-query';

import { useSessionExpiryFromErrors } from '@/application/vault/access-lifecycle/lifecycle-queries';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import type {
  DataKeyInput,
  DecryptInput,
  EncryptInput,
  HashInput,
  HmacInput,
  RandomBytesInput,
  RewrapInput,
  SignInput,
  TransitEngineGateway,
  VerifyHmacInput,
  VerifyInput,
} from '@/domain/engines/transit/transit';
import type { VaultSession } from '@/domain/vault/contracts';
import { useTransitGateway } from './TransitGatewayContext';

/**
 * Cryptographic operations are explicit actions, never queries: their inputs
 * and outputs live only in the component that asked. `gcTime: 0` drops the
 * mutation (variables included) from the mutation cache as soon as that
 * component unmounts.
 */
function useTransitMutation<Input, Output>(
  run: (gateway: TransitEngineGateway, session: VaultSession, input: Input) => Promise<Output>,
) {
  const gateway = useTransitGateway();
  const vault = useVaultSession();
  const mutation = useMutation({
    mutationFn: (input: Input) => run(gateway, vault.session!, input),
    gcTime: 0,
    retry: false,
  });
  useSessionExpiryFromErrors(vault.expireSession, mutation.error);
  return mutation;
}

export function useTransitEncrypt(mount: string, key: string) {
  return useTransitMutation((gateway, session, input: EncryptInput) => gateway.encrypt(session, mount, key, input));
}

export function useTransitDecrypt(mount: string, key: string) {
  return useTransitMutation((gateway, session, input: DecryptInput) => gateway.decrypt(session, mount, key, input));
}

export function useTransitRewrap(mount: string, key: string) {
  return useTransitMutation((gateway, session, input: RewrapInput) => gateway.rewrap(session, mount, key, input));
}

export function useTransitDataKey(mount: string, key: string) {
  return useTransitMutation((gateway, session, input: DataKeyInput) => gateway.generateDataKey(session, mount, key, input));
}

export function useTransitSign(mount: string, key: string) {
  return useTransitMutation((gateway, session, input: SignInput) => gateway.sign(session, mount, key, input));
}

export function useTransitVerify(mount: string, key: string) {
  return useTransitMutation((gateway, session, input: VerifyInput) => gateway.verify(session, mount, key, input));
}

export function useTransitHmac(mount: string, key: string) {
  return useTransitMutation((gateway, session, input: HmacInput) => gateway.hmac(session, mount, key, input));
}

export function useTransitVerifyHmac(mount: string, key: string) {
  return useTransitMutation((gateway, session, input: VerifyHmacInput) => gateway.verifyHmac(session, mount, key, input));
}

export function useTransitRandomBytes(mount: string) {
  return useTransitMutation((gateway, session, input: RandomBytesInput) => gateway.randomBytes(session, mount, input));
}

export function useTransitHash(mount: string) {
  return useTransitMutation((gateway, session, input: HashInput) => gateway.hash(session, mount, input));
}
