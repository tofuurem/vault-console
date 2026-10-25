import { useQueries, useQuery, useQueryClient, type UseQueryResult } from '@tanstack/react-query';
import { useCallback, useEffect, useState } from 'react';

import { engineQueryKeys } from '@/application/engines/useSecretEngines';
import { useSessionExpiryFromErrors } from '@/application/vault/access-lifecycle/lifecycle-queries';
import { useVaultSession } from '@/application/vault/VaultSessionContext';
import type { PkiIssuer, PkiRole, PkiStoredCertificate } from '@/domain/engines/pki/pki';
import { tryParseCertificate, type X509Certificate } from '@/domain/engines/pki/x509';
import { normalizeVaultError, type VaultError } from '@/domain/vault/errors';
import { createConcurrencyLimiter } from '@/shared/async/concurrency-limiter';
import { usePkiGateway } from './PkiGatewayContext';

/** Certificate reads in flight at once for one page of the table. */
export const CERTIFICATE_DETAIL_CONCURRENCY = 6;

/** Every PKI key lives under the mount root so disabling the engine clears it. */
export const pkiQueryKeys = {
  root: (mount: string) => [...engineQueryKeys.mount(mount), 'pki'] as const,
  issuers: (mount: string) => [...pkiQueryKeys.root(mount), 'issuers'] as const,
  issuer: (mount: string, ref: string) => [...pkiQueryKeys.issuers(mount), 'detail', ref] as const,
  issuerCrl: (mount: string, ref: string) => [...pkiQueryKeys.issuers(mount), 'crl', ref] as const,
  keys: (mount: string) => [...pkiQueryKeys.root(mount), 'keys'] as const,
  roles: (mount: string) => [...pkiQueryKeys.root(mount), 'roles'] as const,
  role: (mount: string, name: string) => [...pkiQueryKeys.roles(mount), 'detail', name] as const,
  certificates: (mount: string) => [...pkiQueryKeys.root(mount), 'certs'] as const,
  certificate: (mount: string, serial: string) => [...pkiQueryKeys.certificates(mount), 'detail', serial] as const,
  tidyStatus: (mount: string) => [...pkiQueryKeys.root(mount), 'tidy-status'] as const,
  urls: (mount: string) => [...pkiQueryKeys.root(mount), 'config-urls'] as const,
  crlConfig: (mount: string) => [...pkiQueryKeys.root(mount), 'config-crl'] as const,
};

function useSessionQuery() {
  const gateway = usePkiGateway();
  const vault = useVaultSession();
  return { gateway, vault, session: vault.session };
}

export function usePkiIssuers(mount: string) {
  const { gateway, vault, session } = useSessionQuery();
  const query = useQuery({
    queryKey: pkiQueryKeys.issuers(mount),
    queryFn: ({ signal }) => gateway.listIssuers(session!, mount, signal),
    enabled: Boolean(session),
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

export function usePkiIssuer(mount: string, ref: string | undefined) {
  const { gateway, vault, session } = useSessionQuery();
  const query = useQuery({
    queryKey: pkiQueryKeys.issuer(mount, ref ?? ''),
    queryFn: ({ signal }) => gateway.readIssuer(session!, mount, ref!, signal),
    enabled: Boolean(session && ref),
    retry: false,
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

export function usePkiIssuerCrl(mount: string, ref: string, enabled: boolean) {
  const { gateway, session } = useSessionQuery();
  return useQuery({
    queryKey: pkiQueryKeys.issuerCrl(mount, ref),
    queryFn: ({ signal }) => gateway.readIssuerCrl(session!, mount, ref, signal),
    enabled: enabled && Boolean(session),
    retry: false,
  });
}

export function usePkiKeys(mount: string) {
  const { gateway, session } = useSessionQuery();
  return useQuery({
    queryKey: pkiQueryKeys.keys(mount),
    queryFn: ({ signal }) => gateway.listKeys(session!, mount, signal),
    enabled: Boolean(session),
    retry: false,
  });
}

export function usePkiRoles(mount: string) {
  const { gateway, vault, session } = useSessionQuery();
  const query = useQuery({
    queryKey: pkiQueryKeys.roles(mount),
    queryFn: ({ signal }) => gateway.listRoles(session!, mount, signal),
    enabled: Boolean(session),
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

export function usePkiRole(mount: string, name: string | undefined) {
  const { gateway, vault, session } = useSessionQuery();
  const query = useQuery({
    queryKey: pkiQueryKeys.role(mount, name ?? ''),
    queryFn: ({ signal }) => gateway.readRole(session!, mount, name!, signal),
    enabled: Boolean(session && name),
    retry: false,
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

export function usePkiCertificateSerials(mount: string) {
  const { gateway, vault, session } = useSessionQuery();
  const query = useQuery({
    queryKey: pkiQueryKeys.certificates(mount),
    queryFn: ({ signal }) => gateway.listCertificates(session!, mount, signal),
    enabled: Boolean(session),
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

export interface PkiCertificateDetail {
  readonly stored: PkiStoredCertificate;
  /** Undefined when the stored PEM could not be parsed. */
  readonly parsed?: X509Certificate;
}

export type PkiCertificateDetailState = PkiDetailState<PkiCertificateDetail>;

async function readDetail(read: () => Promise<PkiStoredCertificate>): Promise<PkiCertificateDetail> {
  const stored = await read();
  return { stored, parsed: tryParseCertificate(stored.certificate) };
}

export function usePkiCertificate(mount: string, serial: string | undefined) {
  const { gateway, vault, session } = useSessionQuery();
  const query = useQuery({
    queryKey: pkiQueryKeys.certificate(mount, serial ?? ''),
    queryFn: ({ signal }) => readDetail(() => gateway.readCertificate(session!, mount, serial!, signal)),
    enabled: Boolean(session && serial),
    retry: false,
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

function combineDetails(serials: readonly string[], results: readonly UseQueryResult<PkiCertificateDetail>[]) {
  const details = new Map<string, PkiCertificateDetailState>();
  let sessionExpired = false;
  results.forEach((result, index) => {
    if (result.data) {
      details.set(serials[index], { status: 'success', data: result.data });
    } else if (result.isError) {
      const error = normalizeVaultError(result.error);
      if (error.code === 'session-expired') sessionExpired = true;
      details.set(serials[index], { status: 'error', error });
    } else {
      details.set(serials[index], { status: 'loading' });
    }
  });
  return { details: details as ReadonlyMap<string, PkiCertificateDetailState>, sessionExpired };
}

/** Reads and parses the given certificates (normally one page of rows). */
export function usePkiCertificateDetails(mount: string, serials: readonly string[]): ReadonlyMap<string, PkiCertificateDetailState> {
  const { gateway, vault, session } = useSessionQuery();
  const [limiter] = useState(() => createConcurrencyLimiter(CERTIFICATE_DETAIL_CONCURRENCY));
  const combine = useCallback(
    (results: readonly UseQueryResult<PkiCertificateDetail>[]) => combineDetails(serials, results),
    [serials],
  );
  const { details, sessionExpired } = useQueries({
    queries: serials.map((serial) => ({
      queryKey: pkiQueryKeys.certificate(mount, serial),
      enabled: Boolean(session),
      retry: false,
      queryFn: ({ signal }: { readonly signal: AbortSignal }) => readDetail(
        () => limiter.run(() => gateway.readCertificate(session!, mount, serial, signal), signal),
      ),
    })),
    combine,
  });
  useEffect(() => {
    if (sessionExpired) vault.expireSession();
  }, [sessionExpired, vault]);
  return details;
}

export type PkiDetailState<T> =
  | { readonly status: 'loading' }
  | { readonly status: 'success'; readonly data: T }
  | { readonly status: 'error'; readonly error: VaultError };

function combineStates<T>(keys: readonly string[], results: readonly UseQueryResult<T>[]): ReadonlyMap<string, PkiDetailState<T>> {
  return new Map(keys.map((key, index): readonly [string, PkiDetailState<T>] => {
    const result = results[index];
    if (result.data !== undefined) return [key, { status: 'success', data: result.data }];
    if (result.isError) return [key, { status: 'error', error: normalizeVaultError(result.error) }];
    return [key, { status: 'loading' }];
  }));
}

/** Reads every issuer in `ids`; mounts rarely have more than a handful. */
export function usePkiIssuerDetails(mount: string, ids: readonly string[]) {
  const { gateway, session } = useSessionQuery();
  const [limiter] = useState(() => createConcurrencyLimiter(CERTIFICATE_DETAIL_CONCURRENCY));
  const combine = useCallback((results: readonly UseQueryResult<PkiIssuer>[]) => combineStates(ids, results), [ids]);
  return useQueries({
    queries: ids.map((id) => ({
      queryKey: pkiQueryKeys.issuer(mount, id),
      enabled: Boolean(session),
      retry: false,
      queryFn: ({ signal }: { readonly signal: AbortSignal }) => limiter.run(() => gateway.readIssuer(session!, mount, id, signal), signal),
    })),
    combine,
  });
}

/** Reads the roles in `names` so list rows can describe them. */
export function usePkiRoleDetails(mount: string, names: readonly string[]) {
  const { gateway, session } = useSessionQuery();
  const [limiter] = useState(() => createConcurrencyLimiter(CERTIFICATE_DETAIL_CONCURRENCY));
  const combine = useCallback((results: readonly UseQueryResult<PkiRole>[]) => combineStates(names, results), [names]);
  return useQueries({
    queries: names.map((name) => ({
      queryKey: pkiQueryKeys.role(mount, name),
      enabled: Boolean(session),
      retry: false,
      queryFn: ({ signal }: { readonly signal: AbortSignal }) => limiter.run(() => gateway.readRole(session!, mount, name, signal), signal),
    })),
    combine,
  });
}

/** Looks up certificates already read into the cache, e.g. to search common names. */
export function usePkiCachedCertificate(mount: string) {
  const queryClient = useQueryClient();
  return useCallback(
    (serial: string) => queryClient.getQueryData<PkiCertificateDetail>(pkiQueryKeys.certificate(mount, serial)),
    [mount, queryClient],
  );
}

/** Polls while a tidy run is in progress. */
export function usePkiTidyStatus(mount: string, enabled: boolean) {
  const { gateway, vault, session } = useSessionQuery();
  const query = useQuery({
    queryKey: pkiQueryKeys.tidyStatus(mount),
    queryFn: ({ signal }) => gateway.readTidyStatus(session!, mount, signal),
    enabled: enabled && Boolean(session),
    retry: false,
    refetchInterval: (current) => (current.state.data?.state === 'Running' ? 2_000 : false),
  });
  useSessionExpiryFromErrors(vault.expireSession, query.error);
  return query;
}

export function usePkiUrls(mount: string, enabled: boolean) {
  const { gateway, session } = useSessionQuery();
  return useQuery({
    queryKey: pkiQueryKeys.urls(mount),
    queryFn: ({ signal }) => gateway.readUrls(session!, mount, signal),
    enabled: enabled && Boolean(session),
    retry: false,
  });
}

export function usePkiCrlConfig(mount: string, enabled: boolean) {
  const { gateway, session } = useSessionQuery();
  return useQuery({
    queryKey: pkiQueryKeys.crlConfig(mount),
    queryFn: ({ signal }) => gateway.readCrlConfig(session!, mount, signal),
    enabled: enabled && Boolean(session),
    retry: false,
  });
}
