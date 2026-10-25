import { useRevokeCertificate } from '@/application/engines/pki/usePkiMutations';
import { usePkiCertificate } from '@/application/engines/pki/usePkiQueries';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { useConfirmDialog } from '@/components/base/useConfirmDialog';
import { normalizeVaultError } from '@/domain/vault/errors';
import { CARD_CLASS, fileStem, formatDateTimeText, formatEpochSeconds, LINK_BUTTON_CLASS, pkiErrorText } from '../pki-format';
import CertificateSummary, { SummaryRow } from './CertificateSummary';
import { ErrorNotice } from './Notices';
import { PemBlock } from './PemBlocks';

/** One stored certificate, parsed in the browser, with revocation. */
export default function CertificateDetail({ mount, serial, onBack }: {
  readonly mount: string;
  readonly serial: string;
  readonly onBack: () => void;
}) {
  const toast = useToast();
  const [confirm, confirmDialog] = useConfirmDialog();
  const query = usePkiCertificate(mount, serial);
  const revoke = useRevokeCertificate(mount);
  const back = (
    <button type="button" className={LINK_BUTTON_CLASS} onClick={onBack}>
      <i className="ri-arrow-left-s-line" aria-hidden="true" />
      All certificates
    </button>
  );

  if (query.isPending) return <div className="space-y-3">{back}<ContentSkeleton variant="detail" label="Loading certificate" /></div>;
  if (query.isError) {
    const missing = normalizeVaultError(query.error).code === 'not-found';
    return (
      <div className="space-y-3">
        {back}
        {missing
          ? <p className="text-xs text-foreground-600">No stored certificate has serial <span className="font-mono">{serial}</span>.</p>
          : <ErrorNotice title="The certificate could not be read" error={query.error} permissionHint={`Your token needs read on ${mount}/cert/${serial}.`} />}
      </div>
    );
  }

  const { stored, parsed } = query.data;
  const revoked = stored.revocationTime > 0;
  const revokeCertificate = async () => {
    const confirmed = await confirm({
      title: 'Revoke certificate',
      message: `Revoke ${parsed?.subject.commonName ?? serial}? It is added to the CRL and clients that check revocation will reject it. This cannot be undone.`,
      confirmLabel: 'Revoke',
    });
    if (!confirmed) return;
    revoke.mutate(serial, {
      onSuccess: () => toast.success('Certificate revoked.'),
      onError: (error) => toast.error(pkiErrorText(error).details[0] ?? pkiErrorText(error).message, { title: 'Revoke failed' }),
    });
  };

  return (
    <div className="space-y-4">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-sm font-semibold text-foreground-900">{parsed?.subject.commonName ?? 'Certificate'}</h2>
          <p className="mt-0.5 break-all font-mono text-[11px] tabular-nums text-foreground-500">{serial}</p>
        </div>
        {!revoked && (
          <Button size="sm" variant="danger" onClick={() => void revokeCertificate()} loading={revoke.isPending}>
            <i className="ri-forbid-line" aria-hidden="true" />
            Revoke
          </Button>
        )}
      </header>
      <section aria-label="Certificate details" className={`${CARD_CLASS} space-y-3 p-4`}>
        {parsed ? (
          <CertificateSummary
            certificate={parsed}
            revoked={revoked}
            extra={revoked ? (
              <SummaryRow label="Revoked">
                <span className="tabular-nums">{stored.revokedAt ? formatDateTimeText(stored.revokedAt) : formatEpochSeconds(stored.revocationTime)}</span>
              </SummaryRow>
            ) : undefined}
          />
        ) : (
          <p className="text-xs text-warning-800">The certificate could not be read.</p>
        )}
        <PemBlock label="Certificate" pem={stored.certificate} filename={`${fileStem(parsed?.subject.commonName ?? serial.replace(/:/g, '-'))}.pem`} />
      </section>
      {confirmDialog}
    </div>
  );
}
