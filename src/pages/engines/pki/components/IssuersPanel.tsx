import { useMemo } from 'react';

import { usePkiIssuerDetails, usePkiIssuers } from '@/application/engines/pki/usePkiQueries';
import Badge from '@/components/base/Badge';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { issuerLabel } from '@/domain/engines/pki/pki-helpers';
import { tryParseCertificate } from '@/domain/engines/pki/x509';
import { CARD_CLASS, formatEpochMs } from '../pki-format';
import ExpiryBadge from './ExpiryBadge';
import { ErrorNotice } from './Notices';
import { CaSetupGuide, type CaDialog } from './PkiOverview';

/** Every issuer on the mount, with parsed names and expiry. */
export default function IssuersPanel({ mount, onOpen, onOpenDialog }: {
  readonly mount: string;
  readonly onOpen: (id: string) => void;
  readonly onOpenDialog: (dialog: CaDialog) => void;
}) {
  const issuers = usePkiIssuers(mount);
  const ids = useMemo(() => (issuers.data ?? []).map((issuer) => issuer.id), [issuers.data]);
  const details = usePkiIssuerDetails(mount, ids);

  if (issuers.isPending) return <ContentSkeleton variant="list" label="Loading issuers" />;
  if (issuers.isError) {
    return <ErrorNotice title="Issuers could not be listed" error={issuers.error} permissionHint={`Your token needs list on ${mount}/issuers.`} />;
  }
  if (issuers.data.length === 0) return <CaSetupGuide onOpenDialog={onOpenDialog} />;

  return (
    <ul aria-label="Issuers" className={`${CARD_CLASS} divide-y divide-background-200 overflow-hidden`}>
      {issuers.data.map((issuer) => {
        const detail = details.get(issuer.id);
        const certificate = detail?.status === 'success' ? tryParseCertificate(detail.data.certificate) : undefined;
        const revoked = detail?.status === 'success' && detail.data.revoked;
        return (
          <li key={issuer.id}>
            <button
              type="button"
              onClick={() => onOpen(issuer.id)}
              className="flex min-h-11 w-full flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2 text-left transition-colors hover:bg-background-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
            >
              <i className={`${certificate?.selfSigned ? 'ri-shield-star-line' : 'ri-git-branch-line'} text-sm text-primary-600`} aria-hidden="true" />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className="truncate text-xs font-medium text-foreground-900">
                    {certificate?.subject.commonName ?? issuerLabel(issuer)}
                  </span>
                  {issuer.isDefault && <Badge variant="info">Default</Badge>}
                  {!issuer.keyId && <Badge>No key</Badge>}
                </span>
                <span className="mt-0.5 block truncate font-mono text-[11px] text-foreground-500">
                  {issuer.name ? `${issuer.name} · ` : ''}{issuer.id}
                </span>
              </span>
              {certificate && (
                <span className="flex items-center gap-2 text-[11px] text-foreground-600">
                  <span className="hidden tabular-nums sm:inline">{formatEpochMs(certificate.notAfter)}</span>
                  <ExpiryBadge validity={certificate} revoked={revoked} />
                </span>
              )}
              {detail?.status === 'error' && <span className="text-[11px] text-foreground-500">Details unavailable</span>}
              <i className="ri-arrow-right-s-line text-foreground-400" aria-hidden="true" />
            </button>
          </li>
        );
      })}
    </ul>
  );
}
