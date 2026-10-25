import { useMemo, useState } from 'react';

import { useRevokeCertificate } from '@/application/engines/pki/usePkiMutations';
import {
  usePkiCachedCertificate,
  usePkiCertificateDetails,
  usePkiCertificateSerials,
  type PkiCertificateDetailState,
} from '@/application/engines/pki/usePkiQueries';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { Input } from '@/components/base/Input';
import { useConfirmDialog } from '@/components/base/useConfirmDialog';
import { certificateMatches } from '@/domain/engines/pki/pki-helpers';
import { CARD_CLASS, downloadText, fileStem, formatEpochMs, ICON_BUTTON_CLASS, pkiErrorText } from '../pki-format';
import ExpiryBadge from './ExpiryBadge';
import { EmptyState, ErrorNotice } from './Notices';

export const CERTIFICATES_PAGE_SIZE = 25;

function NameCell({ state, commonName }: { readonly state?: PkiCertificateDetailState; readonly commonName?: string }) {
  if (!state || state.status === 'loading') return <span className="text-foreground-400">Loading…</span>;
  if (state.status === 'error') return <span className="text-foreground-500">{pkiErrorText(state.error).message}</span>;
  return commonName ? <>{commonName}</> : <span className="text-foreground-400">No common name</span>;
}

function CertificateRow({ serial, state, onOpen, onRevoke, revoking }: {
  readonly serial: string;
  readonly state?: PkiCertificateDetailState;
  readonly onOpen: () => void;
  readonly onRevoke: (commonName?: string) => void;
  readonly revoking: boolean;
}) {
  const detail = state?.status === 'success' ? state.data : undefined;
  const parsed = detail?.parsed;
  const revoked = (detail?.stored.revocationTime ?? 0) > 0;
  const commonName = parsed?.subject.commonName;
  return (
    <tr className="align-middle">
      <td className="max-w-0 px-3 py-1.5">
        <button
          type="button"
          onClick={onOpen}
          aria-label={serial}
          className="flex min-h-11 w-full min-w-0 flex-col justify-center rounded text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-0"
        >
          <span className="block w-full truncate font-mono text-[11px] tabular-nums text-primary-700 hover:underline">{serial}</span>
          <span className="block w-full truncate text-xs text-foreground-800 md:hidden">{commonName ?? ''}</span>
        </button>
      </td>
      <td className="hidden max-w-0 truncate px-3 py-1.5 text-xs text-foreground-800 md:table-cell">
        <NameCell state={state} commonName={commonName} />
      </td>
      <td className="hidden whitespace-nowrap px-3 py-1.5 text-xs tabular-nums text-foreground-700 sm:table-cell">
        {parsed ? formatEpochMs(parsed.notAfter) : ''}
      </td>
      <td className="whitespace-nowrap px-3 py-1.5">{parsed && <ExpiryBadge validity={parsed} revoked={revoked} />}</td>
      <td className="whitespace-nowrap px-1 py-1 text-right">
        <span className="inline-flex">
          <button
            type="button"
            aria-label={`Download ${serial}`}
            className={ICON_BUTTON_CLASS}
            disabled={!detail}
            onClick={() => detail && downloadText(`${fileStem(commonName ?? serial.replace(/:/g, '-'))}.pem`, detail.stored.certificate)}
          >
            <i className="ri-download-2-line text-sm" aria-hidden="true" />
          </button>
          <button
            type="button"
            aria-label={`Revoke ${serial}`}
            className={`${ICON_BUTTON_CLASS} hover:text-danger-700 disabled:opacity-40`}
            disabled={revoked || revoking}
            onClick={() => onRevoke(commonName)}
          >
            <i className="ri-forbid-line text-sm" aria-hidden="true" />
          </button>
        </span>
      </td>
    </tr>
  );
}

function Pagination({ page, pages, total, onPage }: { readonly page: number; readonly pages: number; readonly total: number; readonly onPage: (page: number) => void }) {
  if (pages <= 1) return null;
  const first = page * CERTIFICATES_PAGE_SIZE + 1;
  const last = Math.min(total, (page + 1) * CERTIFICATES_PAGE_SIZE);
  return (
    <nav aria-label="Certificate pages" className="flex flex-wrap items-center justify-between gap-2 text-xs text-foreground-600">
      <span className="tabular-nums">{first}–{last} of {total}</span>
      <span className="flex gap-1.5">
        <Button size="sm" onClick={() => onPage(page - 1)} disabled={page === 0}>Previous</Button>
        <Button size="sm" onClick={() => onPage(page + 1)} disabled={page >= pages - 1}>Next</Button>
      </span>
    </nav>
  );
}

/** Stored certificates: details load 25 at a time, search covers serials and loaded names. */
export default function CertificatesPanel({ mount, onOpen }: { readonly mount: string; readonly onOpen: (serial: string) => void }) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirmDialog();
  const serials = usePkiCertificateSerials(mount);
  const cached = usePkiCachedCertificate(mount);
  const revoke = useRevokeCertificate(mount);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(0);

  // Not memoized: common names become searchable as rows load into the cache.
  const filtered = (serials.data ?? []).filter((serial) => certificateMatches(search, serial, cached(serial)?.parsed?.subject.commonName));
  const pages = Math.max(1, Math.ceil(filtered.length / CERTIFICATES_PAGE_SIZE));
  const currentPage = Math.min(page, pages - 1);
  const visibleKey = filtered.slice(currentPage * CERTIFICATES_PAGE_SIZE, (currentPage + 1) * CERTIFICATES_PAGE_SIZE).join('\n');
  // A stable array keeps the per-row queries from being rebuilt on every render.
  const visible = useMemo(() => (visibleKey ? visibleKey.split('\n') : []), [visibleKey]);
  const details = usePkiCertificateDetails(mount, visible);

  if (serials.isPending) return <ContentSkeleton variant="list" label="Loading certificates" />;
  if (serials.isError) {
    return <ErrorNotice title="Certificates could not be listed" error={serials.error} permissionHint={`Your token needs list on ${mount}/certs.`} />;
  }
  if (serials.data.length === 0) {
    return (
      <EmptyState icon="ri-file-list-3-line" title="No stored certificates">
        Certificates appear here after they are issued or signed through a role that stores them. Roles with
        &ldquo;Do not store certificates&rdquo; turned on never show up in this list.
      </EmptyState>
    );
  }

  const revokeSerial = async (serial: string, commonName?: string) => {
    const confirmed = await confirm({
      title: 'Revoke certificate',
      message: `Revoke ${commonName ? `${commonName} (${serial})` : serial}? It is added to the CRL and clients that check revocation will reject it. This cannot be undone.`,
      confirmLabel: 'Revoke',
    });
    if (!confirmed) return;
    revoke.mutate(serial, {
      onSuccess: () => toast.success('Certificate revoked.'),
      onError: (error) => toast.error(pkiErrorText(error).details[0] ?? pkiErrorText(error).message, { title: 'Revoke failed' }),
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="w-full max-w-sm">
          <Input
            aria-label="Search certificates"
            icon="ri-search-line"
            value={search}
            onChange={(event) => {
              setSearch(event.target.value);
              setPage(0);
            }}
            placeholder="Serial or common name"
            hint="Common names are searched among certificates already loaded."
          />
        </div>
        <span className="text-xs tabular-nums text-foreground-500">{serials.data.length} stored</span>
      </div>
      {filtered.length === 0 ? (
        <p className="text-xs text-foreground-500">No certificate matches this search.</p>
      ) : (
        <div className={`${CARD_CLASS} overflow-hidden`}>
          <table className="w-full table-fixed text-left">
            <thead className="border-b border-background-200 bg-background-100 text-[10px] font-semibold uppercase tracking-wider text-foreground-500">
              <tr>
                <th scope="col" className="px-3 py-1.5">Serial</th>
                <th scope="col" className="hidden px-3 py-1.5 md:table-cell">Common name</th>
                <th scope="col" className="hidden w-40 px-3 py-1.5 sm:table-cell">Expires</th>
                <th scope="col" className="w-32 px-3 py-1.5">Status</th>
                <th scope="col" className="w-24 px-3 py-1.5 sm:w-20"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-background-200">
              {visible.map((serial) => (
                <CertificateRow
                  key={serial}
                  serial={serial}
                  state={details.get(serial)}
                  onOpen={() => onOpen(serial)}
                  onRevoke={(commonName) => void revokeSerial(serial, commonName)}
                  revoking={revoke.isPending && revoke.variables === serial}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
      <Pagination page={currentPage} pages={pages} total={filtered.length} onPage={setPage} />
      {confirmDialog}
    </div>
  );
}
