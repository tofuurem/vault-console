import Button from '@/components/base/Button';
import type { PkiIssuedCertificate } from '@/domain/engines/pki/pki';
import { tryParseCertificate } from '@/domain/engines/pki/x509';
import { downloadText, fileStem, joinPem } from '../pki-format';
import CertificateSummary from './CertificateSummary';
import { WarningList } from './Notices';
import { PemBlock, PrivateKeyPanel } from './PemBlocks';

/** A freshly issued or signed certificate, shown once and kept only in component state. */
export default function SignedCertificateResult({ result, bundle, onKeySaved }: {
  readonly result: PkiIssuedCertificate;
  /** Offer a single file with key, certificate, and chain (the `pem_bundle` format). */
  readonly bundle: boolean;
  readonly onKeySaved: () => void;
}) {
  const parsed = tryParseCertificate(result.certificate);
  const stem = fileStem(parsed?.subject.commonName ?? result.serialNumber);
  const chain = result.caChain.length > 0 ? result.caChain : [result.issuingCa].filter(Boolean);
  const downloadBundle = () => {
    if (!result.privateKey) return;
    downloadText(`${stem}.bundle.pem`, joinPem([result.privateKey.reveal(), result.certificate, ...chain]));
    onKeySaved();
  };
  return (
    <div className="space-y-4">
      <WarningList warnings={result.warnings} />
      {result.privateKey && (
        <>
          <PrivateKeyPanel privateKey={result.privateKey} filename={`${stem}.key.pem`} onSaved={onKeySaved} />
          {bundle && (
            <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-background-300 bg-background-100 px-3 py-2 text-xs text-foreground-700">
              <span>One file with the private key, certificate, and chain.</span>
              <Button size="sm" onClick={downloadBundle}>
                <i className="ri-download-2-line" aria-hidden="true" />
                Download bundle
              </Button>
            </div>
          )}
        </>
      )}
      {parsed && <section aria-label="Certificate details" className="rounded-md border border-background-300 px-3 py-1"><CertificateSummary certificate={parsed} /></section>}
      <PemBlock label="Certificate" pem={result.certificate} filename={`${stem}.pem`} />
      {chain.length > 0 && <PemBlock label="CA chain" pem={joinPem(chain)} filename={`${stem}-chain.pem`} collapsed />}
    </div>
  );
}
