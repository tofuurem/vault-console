import { useMutation, useQueryClient } from '@tanstack/react-query';

import { useVaultSession } from '@/application/vault/VaultSessionContext';
import type {
  PkiCrlConfig,
  PkiGenerateIntermediateInput,
  PkiGenerateRootInput,
  PkiIssueInput,
  PkiIssuerUpdate,
  PkiRoleInput,
  PkiSignInput,
  PkiSignIntermediateInput,
  PkiTidyInput,
  PkiUrlsConfig,
} from '@/domain/engines/pki/pki';
import { usePkiGateway } from './PkiGatewayContext';
import { pkiQueryKeys } from './usePkiQueries';

/**
 * Results that carry private keys are never kept: `gcTime: 0` drops the
 * mutation state as soon as the component that asked for it unmounts, and the
 * keys themselves are `PkiPrivateKey` values that redact in JSON and strings.
 */
const SECRET_RESULT = { gcTime: 0 } as const;

function useContextValues() {
  const gateway = usePkiGateway();
  const vault = useVaultSession();
  const queryClient = useQueryClient();
  const invalidate = (key: readonly unknown[]) => queryClient.invalidateQueries({ queryKey: key });
  return { gateway, session: () => vault.session!, queryClient, invalidate };
}

export function useGenerateRoot(mount: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    ...SECRET_RESULT,
    mutationFn: (input: PkiGenerateRootInput) => gateway.generateRoot(session(), mount, input),
    onSuccess: () => invalidate(pkiQueryKeys.root(mount)),
  });
}

export function useGenerateIntermediate(mount: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    ...SECRET_RESULT,
    mutationFn: (input: PkiGenerateIntermediateInput) => gateway.generateIntermediate(session(), mount, input),
    onSuccess: () => invalidate(pkiQueryKeys.keys(mount)),
  });
}

export function useSetSignedIntermediate(mount: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    mutationFn: (certificate: string) => gateway.setSignedIntermediate(session(), mount, certificate),
    onSuccess: () => invalidate(pkiQueryKeys.root(mount)),
  });
}

/** Signs a CSR on another PKI mount; that mount's certificate list changes. */
export function useSignIntermediate() {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    mutationFn: ({ rootMount, input }: { readonly rootMount: string; readonly input: PkiSignIntermediateInput }) =>
      gateway.signIntermediate(session(), rootMount, input),
    onSuccess: (_result, { rootMount }) => invalidate(pkiQueryKeys.certificates(rootMount)),
  });
}

export function useImportIssuerBundle(mount: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    ...SECRET_RESULT,
    mutationFn: (pemBundle: string) => gateway.importBundle(session(), mount, pemBundle),
    onSuccess: () => invalidate(pkiQueryKeys.root(mount)),
  });
}

export function useUpdateIssuer(mount: string, ref: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    mutationFn: (input: PkiIssuerUpdate) => gateway.updateIssuer(session(), mount, ref, input),
    onSuccess: () => invalidate(pkiQueryKeys.issuers(mount)),
  });
}

export function useSetDefaultIssuer(mount: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    mutationFn: (ref: string) => gateway.setDefaultIssuer(session(), mount, ref),
    onSuccess: () => invalidate(pkiQueryKeys.issuers(mount)),
  });
}

export function useDeleteIssuer(mount: string) {
  const { gateway, session, queryClient, invalidate } = useContextValues();
  return useMutation({
    mutationFn: (ref: string) => gateway.deleteIssuer(session(), mount, ref),
    onSuccess: async (_warnings, ref) => {
      queryClient.removeQueries({ queryKey: pkiQueryKeys.issuer(mount, ref) });
      await invalidate(pkiQueryKeys.root(mount));
    },
  });
}

export function useSaveRole(mount: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    mutationFn: ({ name, input, mode }: { readonly name: string; readonly input: PkiRoleInput; readonly mode: 'create' | 'update' }) =>
      gateway.saveRole(session(), mount, name, input, mode),
    onSuccess: () => invalidate(pkiQueryKeys.roles(mount)),
  });
}

export function useDeleteRole(mount: string) {
  const { gateway, session, queryClient, invalidate } = useContextValues();
  return useMutation({
    mutationFn: (name: string) => gateway.deleteRole(session(), mount, name),
    onSuccess: async (_result, name) => {
      queryClient.removeQueries({ queryKey: pkiQueryKeys.role(mount, name) });
      await invalidate(pkiQueryKeys.roles(mount));
    },
  });
}

export function useIssueCertificate(mount: string, role: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    ...SECRET_RESULT,
    mutationFn: (input: PkiIssueInput) => gateway.issueCertificate(session(), mount, role, input),
    onSuccess: () => invalidate(pkiQueryKeys.certificates(mount)),
  });
}

export function useSignCertificate(mount: string, role: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    mutationFn: (input: PkiSignInput) => gateway.signCertificate(session(), mount, role, input),
    onSuccess: () => invalidate(pkiQueryKeys.certificates(mount)),
  });
}

export function useRevokeCertificate(mount: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    mutationFn: (serial: string) => gateway.revokeCertificate(session(), mount, serial),
    onSuccess: (_result, serial) => Promise.all([
      invalidate(pkiQueryKeys.certificate(mount, serial)),
      invalidate(pkiQueryKeys.issuers(mount)),
    ]),
  });
}

export function useTidy(mount: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    mutationFn: (input: PkiTidyInput) => gateway.tidy(session(), mount, input),
    onSuccess: () => Promise.all([
      invalidate(pkiQueryKeys.tidyStatus(mount)),
      invalidate(pkiQueryKeys.certificates(mount)),
    ]),
  });
}

export function useSaveUrls(mount: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    mutationFn: (input: PkiUrlsConfig) => gateway.writeUrls(session(), mount, input),
    onSuccess: () => invalidate(pkiQueryKeys.urls(mount)),
  });
}

export function useSaveCrlConfig(mount: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    mutationFn: (input: PkiCrlConfig) => gateway.writeCrlConfig(session(), mount, input),
    onSuccess: () => invalidate(pkiQueryKeys.crlConfig(mount)),
  });
}

export function useRotateCrl(mount: string) {
  const { gateway, session, invalidate } = useContextValues();
  return useMutation({
    mutationFn: () => gateway.rotateCrl(session(), mount),
    onSuccess: () => invalidate([...pkiQueryKeys.issuers(mount), 'crl']),
  });
}
