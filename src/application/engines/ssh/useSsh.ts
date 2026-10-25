import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import { useSessionExpiryFromErrors } from '@/application/vault/access-lifecycle/lifecycle-queries';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import type { SshCaSetupInput, SshOtp, SshOtpRequest, SshRoleInput, SshSignInput } from '@/domain/engines/ssh/ssh';
import { engineQueryKeys } from '../useSecretEngines';
import { useSshGateway } from './SshGatewayContext';

/** Everything cached for an SSH mount lives under the mount root so disabling the engine clears it. */
export const sshQueryKeys = {
  root: (mount: string) => [...engineQueryKeys.mount(mount), 'ssh'] as const,
  ca: (mount: string) => [...sshQueryKeys.root(mount), 'ca'] as const,
  roles: (mount: string) => [...sshQueryKeys.root(mount), 'roles'] as const,
  role: (mount: string, name: string) => [...sshQueryKeys.roles(mount), name] as const,
  zeroAddress: (mount: string) => [...sshQueryKeys.root(mount), 'zero-address'] as const,
};

/**
 * Signed certificates, OTPs, and imported private keys must not outlive the
 * component that asked for them, so those mutations drop out of the cache on unmount.
 */
const EPHEMERAL = { gcTime: 0, retry: false } as const;

function useSsh() {
  const gateway = useSshGateway();
  const vault = useVaultSession();
  return { gateway, vault, session: () => vault.session! };
}

export function useSshCa(mount: string) {
  const { gateway, vault, session } = useSsh();
  const query = useQuery({
    queryKey: sshQueryKeys.ca(mount),
    queryFn: ({ signal }) => gateway.readCa(session(), mount, signal),
    enabled: Boolean(vault.session),
    retry: false,
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

export function useConfigureSshCa(mount: string) {
  const { gateway, session } = useSsh();
  const queryClient = useQueryClient();
  return useMutation({
    ...EPHEMERAL,
    mutationFn: (input: SshCaSetupInput) => gateway.configureCa(session(), mount, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sshQueryKeys.ca(mount) }),
  });
}

export function useDeleteSshCa(mount: string) {
  const { gateway, session } = useSsh();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: () => gateway.deleteCa(session(), mount),
    onSuccess: () => {
      queryClient.setQueryData(sshQueryKeys.ca(mount), null);
      return queryClient.invalidateQueries({ queryKey: sshQueryKeys.ca(mount) });
    },
  });
}

export function useSshRoles(mount: string) {
  const { gateway, vault, session } = useSsh();
  const query = useQuery({
    queryKey: sshQueryKeys.roles(mount),
    queryFn: ({ signal }) => gateway.listRoles(session(), mount, signal),
    enabled: Boolean(vault.session),
    retry: false,
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

export function useSshRole(mount: string, name: string | undefined) {
  const { gateway, vault, session } = useSsh();
  const query = useQuery({
    queryKey: sshQueryKeys.role(mount, name ?? ''),
    queryFn: ({ signal }) => gateway.readRole(session(), mount, name!, signal),
    enabled: Boolean(vault.session && name),
    retry: false,
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

export function useWriteSshRole(mount: string) {
  const { gateway, session } = useSsh();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ name, input }: { readonly name: string; readonly input: SshRoleInput }) =>
      gateway.writeRole(session(), mount, name, input),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sshQueryKeys.roles(mount) }),
  });
}

export function useDeleteSshRole(mount: string) {
  const { gateway, session } = useSsh();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => gateway.deleteRole(session(), mount, name),
    onSuccess: (_result, name) => {
      queryClient.removeQueries({ queryKey: sshQueryKeys.role(mount, name), exact: true });
      return Promise.all([
        queryClient.invalidateQueries({ queryKey: sshQueryKeys.roles(mount), exact: true }),
        queryClient.invalidateQueries({ queryKey: sshQueryKeys.zeroAddress(mount) }),
      ]);
    },
  });
}

export function useSignSshKey(mount: string) {
  const { gateway, session } = useSsh();
  return useMutation({
    ...EPHEMERAL,
    mutationFn: (input: SshSignInput) => gateway.signKey(session(), mount, input),
  });
}

export function useCreateSshOtp(mount: string) {
  const { gateway, session } = useSsh();
  return useMutation({
    ...EPHEMERAL,
    mutationFn: ({ role, request }: { readonly role: string; readonly request: SshOtpRequest }) =>
      gateway.createOtp(session(), mount, role, request),
  });
}

export function useVerifySshOtp(mount: string) {
  const { gateway, session } = useSsh();
  return useMutation({
    ...EPHEMERAL,
    mutationFn: (otp: SshOtp) => gateway.verifyOtp(session(), mount, otp),
  });
}

export function useSshZeroAddress(mount: string) {
  const { gateway, vault, session } = useSsh();
  const query = useQuery({
    queryKey: sshQueryKeys.zeroAddress(mount),
    queryFn: ({ signal }) => gateway.readZeroAddressRoles(session(), mount, signal),
    enabled: Boolean(vault.session),
    retry: false,
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

export function useWriteSshZeroAddress(mount: string) {
  const { gateway, session } = useSsh();
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (roles: readonly string[]) => gateway.writeZeroAddressRoles(session(), mount, roles),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: sshQueryKeys.zeroAddress(mount) }),
  });
}
