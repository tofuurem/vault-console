import { useMemo } from 'react';

import {
  usePkiCertificateSerials,
  usePkiIssuerDetails,
  usePkiIssuers,
  usePkiRoles,
} from '@/application/engines/pki/usePkiQueries';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import type { PkiIssuerSummary } from '@/domain/engines/pki/pki';
import { expiryState, issuerLabel } from '@/domain/engines/pki/pki-helpers';
import { tryParseCertificate, type X509Certificate } from '@/domain/engines/pki/x509';
import { CARD_CLASS, formatEpochMs, LINK_BUTTON_CLASS } from '../pki-format';
import type { PkiTab } from '../pki-route';
import ExpiryBadge from './ExpiryBadge';
import { ErrorNotice } from './Notices';

export type CaDialog = 'root' | 'intermediate' | 'import';

interface OverviewProps {
  readonly mount: string;
  readonly onOpenDialog: (dialog: CaDialog) => void;
  readonly onNavigate: (tab: PkiTab, id?: string) => void;
}

function SetupChoice({ icon, title, description, action, onClick, primary = false }: {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly action: string;
  readonly onClick: () => void;
  readonly primary?: boolean;
}) {
  return (
    <div className={`${CARD_CLASS} flex flex-col p-4`}>
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
        <i className={`${icon} text-base`} aria-hidden="true" />
      </div>
      <h3 className="mt-3 text-sm font-semibold text-foreground-900">{title}</h3>
      <p className="mt-1 flex-1 text-xs leading-5 text-foreground-600">{description}</p>
      <div className="mt-4">
        <Button size="sm" variant={primary ? 'primary' : 'secondary'} onClick={onClick}>{action}</Button>
      </div>
    </div>
  );
}

/** First-run guide when the mount has no issuers yet. */
export function CaSetupGuide({ onOpenDialog }: { readonly onOpenDialog: (dialog: CaDialog) => void }) {
  return (
    <section aria-labelledby="pki-setup-title" className="space-y-4">
      <div>
        <h2 id="pki-setup-title" className="text-sm font-semibold text-foreground-900">Set up a certificate authority</h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-foreground-600">
          This mount has no issuer yet, so it cannot sign certificates. Choose how this CA fits into your chain of trust.
        </p>
      </div>
      <div className="grid gap-3 md:grid-cols-3">
        <SetupChoice
          icon="ri-shield-star-line"
          title="Root CA"
          description="Start a new chain of trust. Best for a dedicated root mount that signs intermediates."
          action="Create root CA"
          onClick={() => onOpenDialog('root')}
          primary
        />
        <SetupChoice
          icon="ri-git-branch-line"
          title="Intermediate CA"
          description="Get signed by a root on another mount or by an external CA. Recommended for issuing day-to-day certificates."
          action="Create intermediate"
          onClick={() => onOpenDialog('intermediate')}
        />
        <SetupChoice
          icon="ri-upload-2-line"
          title="Existing CA"
          description="Import a CA certificate and key you already have, in PEM format."
          action="Import CA"
          onClick={() => onOpenDialog('import')}
        />
      </div>
    </section>
  );
}

function Stat({ label, value, onClick }: { readonly label: string; readonly value: string; readonly onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`${CARD_CLASS} min-h-11 p-3 text-left transition-colors hover:border-background-400 hover:bg-background-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400`}
    >
      <span className="block text-[11px] font-medium text-foreground-500">{label}</span>
      <span className="mt-1 block text-lg font-semibold tabular-nums text-foreground-900">{value}</span>
    </button>
  );
}

interface ParsedIssuer {
  readonly summary: PkiIssuerSummary;
  readonly certificate?: X509Certificate;
}

function DefaultIssuerCard({ issuer, onOpen }: { readonly issuer?: ParsedIssuer; readonly onOpen: (id: string) => void }) {
  if (!issuer) {
    return (
      <div className={`${CARD_CLASS} p-4 text-xs leading-5 text-warning-900`}>
        No default issuer is set. Requests that do not name an issuer will fail until you choose one on the Issuers tab.
      </div>
    );
  }
  const certificate = issuer.certificate;
  return (
    <div className={`${CARD_CLASS} p-4`}>
      <p className="text-[11px] font-medium text-foreground-500">Default issuer</p>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-foreground-900">{certificate?.subject.commonName ?? issuerLabel(issuer.summary)}</h3>
        {certificate && <ExpiryBadge validity={certificate} />}
      </div>
      {certificate && (
        <p className="mt-1 text-xs text-foreground-600">
          {certificate.selfSigned ? 'Root' : 'Intermediate'} CA · {certificate.keyAlgorithm} · expires{' '}
          <span className="tabular-nums">{formatEpochMs(certificate.notAfter)}</span>
        </p>
      )}
      <button type="button" className={`${LINK_BUTTON_CLASS} mt-2`} onClick={() => onOpen(issuer.summary.id)}>
        View issuer
        <i className="ri-arrow-right-s-line" aria-hidden="true" />
      </button>
    </div>
  );
}

function countLabel(query: { readonly data?: readonly unknown[]; readonly isError: boolean }): string {
  if (query.isError) return '–';
  return query.data ? String(query.data.length) : '…';
}

/** Summary of the CA: default issuer, counts, and issuers that need attention. */
export default function PkiOverview({ mount, onOpenDialog, onNavigate }: OverviewProps) {
  const issuers = usePkiIssuers(mount);
  const roles = usePkiRoles(mount);
  const certificates = usePkiCertificateSerials(mount);
  const ids = useMemo(() => (issuers.data ?? []).map((issuer) => issuer.id), [issuers.data]);
  const details = usePkiIssuerDetails(mount, ids);

  if (issuers.isPending) return <ContentSkeleton variant="list" label="Loading issuers" />;
  if (issuers.isError) {
    return <ErrorNotice title="Issuers could not be listed" error={issuers.error} permissionHint={`Your token needs list on ${mount}/issuers.`} />;
  }
  if (issuers.data.length === 0) return <CaSetupGuide onOpenDialog={onOpenDialog} />;

  const parsed: readonly ParsedIssuer[] = issuers.data.map((summary) => {
    const detail = details.get(summary.id);
    return { summary, certificate: detail?.status === 'success' ? tryParseCertificate(detail.data.certificate) : undefined };
  });
  const attention = parsed.filter((issuer) => issuer.certificate && expiryState(issuer.certificate) !== 'valid');

  return (
    <div className="space-y-4">
      <div className="grid gap-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
        <DefaultIssuerCard issuer={parsed.find((issuer) => issuer.summary.isDefault)} onOpen={(id) => onNavigate('issuers', id)} />
        <div className="grid grid-cols-3 gap-3">
          <Stat label="Issuers" value={String(issuers.data.length)} onClick={() => onNavigate('issuers')} />
          <Stat label="Roles" value={countLabel(roles)} onClick={() => onNavigate('roles')} />
          <Stat label="Certificates" value={countLabel(certificates)} onClick={() => onNavigate('certificates')} />
        </div>
      </div>
      {attention.length > 0 && (
        <section aria-labelledby="pki-attention" className={`${CARD_CLASS} p-4`}>
          <h3 id="pki-attention" className="text-xs font-semibold text-foreground-900">Issuers that need attention</h3>
          <ul className="mt-2 divide-y divide-background-200">
            {attention.map(({ summary, certificate }) => (
              <li key={summary.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-xs">
                <button type="button" className={LINK_BUTTON_CLASS} onClick={() => onNavigate('issuers', summary.id)}>
                  {certificate?.subject.commonName ?? issuerLabel(summary)}
                </button>
                {certificate && <ExpiryBadge validity={certificate} />}
              </li>
            ))}
          </ul>
        </section>
      )}
      {roles.data?.length === 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-primary-200 bg-primary-50 p-4">
          <p className="text-xs leading-5 text-primary-900">
            Next step: create a role. Roles decide which names, key types, and lifetimes certificates may have.
          </p>
          <Button size="sm" variant="primary" onClick={() => onNavigate('roles', '')}>Go to roles</Button>
        </div>
      )}
    </div>
  );
}
