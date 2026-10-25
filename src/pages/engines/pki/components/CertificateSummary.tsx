import type { ReactNode } from 'react';

import type { X509Certificate } from '@/domain/engines/pki/x509';
import { formatEpochMs } from '../pki-format';
import ExpiryBadge from './ExpiryBadge';

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <div className="grid gap-0.5 py-1.5 sm:grid-cols-[140px_1fr] sm:gap-3">
      <dt className="text-foreground-500">{label}</dt>
      <dd className="min-w-0 break-words text-foreground-800">{children}</dd>
    </div>
  );
}

function keyDescription(certificate: X509Certificate): string {
  if (certificate.keyAlgorithm === 'unknown') return 'Unknown';
  if (certificate.keyAlgorithm === 'EC') {
    return `EC ${certificate.curve ?? ''}`.trim();
  }
  if (certificate.keyAlgorithm === 'RSA') return `RSA ${certificate.keySize ?? ''}`.trim();
  return certificate.keyAlgorithm;
}

function altNameText(certificate: X509Certificate): string {
  const { dns, ip, email, uri } = certificate.altNames;
  return [...dns, ...ip, ...email, ...uri].join(', ');
}

function caText(certificate: X509Certificate): string {
  if (!certificate.isCa) return 'No, end-entity certificate';
  if (certificate.pathLength === undefined) return 'Yes';
  return certificate.pathLength === 0
    ? 'Yes, cannot sign other CAs'
    : `Yes, up to ${certificate.pathLength} more CA level${certificate.pathLength === 1 ? '' : 's'}`;
}

/** Fields parsed from a certificate in the browser. */
export default function CertificateSummary({ certificate, revoked = false, extra }: {
  readonly certificate: X509Certificate;
  readonly revoked?: boolean;
  readonly extra?: ReactNode;
}) {
  const altNames = altNameText(certificate);
  return (
    <dl className="divide-y divide-background-200 text-xs">
      <Row label="Common name">
        <span className="font-medium text-foreground-900">{certificate.subject.commonName ?? 'None'}</span>
      </Row>
      <Row label="Subject"><span className="font-mono text-[11px]">{certificate.subject.text || 'Empty'}</span></Row>
      <Row label="Issuer">
        <span className="font-mono text-[11px]">{certificate.issuer.text || 'Empty'}</span>
        {certificate.selfSigned && <span className="ml-1.5 text-foreground-500">(self-signed)</span>}
      </Row>
      <Row label="Serial number"><span className="break-all font-mono text-[11px] tabular-nums">{certificate.serialNumber}</span></Row>
      <Row label="Valid from"><span className="tabular-nums">{formatEpochMs(certificate.notBefore)}</span></Row>
      <Row label="Expires">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          <span className="tabular-nums">{formatEpochMs(certificate.notAfter)}</span>
          <ExpiryBadge validity={certificate} revoked={revoked} />
        </span>
      </Row>
      {altNames && <Row label="Alternative names"><span className="font-mono text-[11px]">{altNames}</span></Row>}
      <Row label="Key">{keyDescription(certificate)}</Row>
      <Row label="Certificate authority">{caText(certificate)}</Row>
      {certificate.extendedKeyUsage.length > 0 && <Row label="Extended usage">{certificate.extendedKeyUsage.join(', ')}</Row>}
      <Row label="Signature">{certificate.signatureAlgorithm}</Row>
      {extra}
    </dl>
  );
}

export { Row as SummaryRow };
