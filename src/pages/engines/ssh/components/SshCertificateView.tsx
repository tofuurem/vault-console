import { useMemo, type ReactNode } from 'react';

import Badge from '@/components/base/Badge';
import Button from '@/components/base/Button';
import type { SshSignedKey } from '@/domain/engines/ssh/ssh';
import { sshCertificateStatus, tryParseSshCertificate, type SshCertificate, type SshCertificateOption } from '@/domain/engines/ssh/ssh-certificate';
import { certificateFileName, sshConnectHint } from '@/domain/engines/ssh/ssh-keys';
import { formatDateTime, formatRelativeTime } from '@/shared/format/date-time';
import { CodeBlock, Notice } from './ssh-ui';
import { downloadText, useCopy } from './useCopy';
import { useFingerprint } from './useFingerprint';

const STATUS = {
  valid: { label: 'Valid now', variant: 'success' },
  expired: { label: 'Expired', variant: 'danger' },
  'not-yet-valid': { label: 'Not valid yet', variant: 'warning' },
} as const;

function When({ date, fallback }: { readonly date: Date | null; readonly fallback: string }) {
  if (!date) return <span>{fallback}</span>;
  return (
    <span className="tabular-nums">
      <time dateTime={date.toISOString()} title={date.toISOString()}>{formatDateTime(date.toISOString())}</time>
      <span className="text-foreground-500"> · {formatRelativeTime(date)}</span>
    </span>
  );
}

function Options({ options, empty }: { readonly options: readonly SshCertificateOption[]; readonly empty: string }) {
  if (options.length === 0) return <span className="text-foreground-500">{empty}</span>;
  return (
    <ul className="flex flex-wrap gap-1">
      {options.map((option) => (
        <li key={option.name} className="rounded bg-background-200 px-1.5 py-0.5 font-mono text-[11px] text-foreground-800">
          {option.value ? `${option.name}=${option.value}` : option.name}
        </li>
      ))}
    </ul>
  );
}

function Row({ label, children }: { readonly label: string; readonly children: ReactNode }) {
  return (
    <>
      <dt className="text-foreground-500">{label}</dt>
      <dd className="min-w-0 break-words text-foreground-800">{children}</dd>
    </>
  );
}

function CertificateDetails({ certificate }: { readonly certificate: SshCertificate }) {
  const fingerprint = useFingerprint(certificate.signingKey);
  const status = STATUS[sshCertificateStatus(certificate)];
  return (
    <dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-[9rem_minmax(0,1fr)] sm:gap-y-1.5">
      <Row label="Type">
        <span className="inline-flex flex-wrap items-center gap-1.5">
          {certificate.certType === 'user' ? 'User certificate' : 'Host certificate'}
          <Badge variant={status.variant}>{status.label}</Badge>
        </span>
      </Row>
      <Row label="Principals">
        {certificate.principals.length > 0
          ? <Options options={certificate.principals.map((name) => ({ name, value: '' }))} empty="" />
          : (
            <span className="text-warning-700">
              {certificate.certType === 'user'
                ? 'None. sshd rejects user certificates without principals.'
                : 'None. Clients accept it for any host name.'}
            </span>
          )}
      </Row>
      <Row label="Valid from"><When date={certificate.validAfter} fallback="Always" /></Row>
      <Row label="Valid until"><When date={certificate.validBefore} fallback="Forever" /></Row>
      <Row label="Serial">
        <span className="font-mono tabular-nums">{certificate.serial}</span>
        <span className="font-mono tabular-nums text-foreground-500"> (0x{certificate.serialHex})</span>
      </Row>
      <Row label="Key ID"><span className="break-all font-mono">{certificate.keyId || '—'}</span></Row>
      <Row label="Extensions"><Options options={certificate.extensions} empty="None" /></Row>
      <Row label="Critical options"><Options options={certificate.criticalOptions} empty="None" /></Row>
      <Row label="Signed by">
        <span className="break-all font-mono">{fingerprint ?? certificate.signingKeyType}</span>
        <span className="text-foreground-500"> · {certificate.signatureAlgorithm}</span>
      </Row>
    </dl>
  );
}

/** The signed certificate once, with copy, download, parsed details, and how to use it. */
export default function SshCertificateView({ signed, publicKeyType, onClear }: {
  readonly signed: SshSignedKey;
  readonly publicKeyType: string;
  readonly onClear: () => void;
}) {
  const copy = useCopy();
  const certificate = useMemo(() => tryParseSshCertificate(signed.signedKey), [signed.signedKey]);
  const fileName = certificateFileName(certificate?.keyType ?? publicKeyType);
  const host = certificate?.certType === 'host';
  return (
    <section aria-labelledby="ssh-signed-title" className="overflow-hidden rounded-lg border border-success-200 bg-background-50">
      <header className="flex flex-wrap items-center justify-between gap-2 border-b border-success-200 bg-success-50 px-3 py-2 sm:px-4">
        <h2 id="ssh-signed-title" className="flex items-center gap-1.5 text-xs font-semibold text-success-800">
          <i className="ri-checkbox-circle-line" aria-hidden="true" />
          Certificate signed
        </h2>
        <Button size="sm" variant="ghost" onClick={onClear}>
          <i className="ri-close-line" aria-hidden="true" />
          Clear
        </Button>
      </header>
      <div className="space-y-3 p-3 sm:p-4">
        <CodeBlock
          id="signed-key"
          label={fileName}
          value={signed.signedKey}
          copy={copy}
          actions={(
            <Button size="sm" variant="ghost" onClick={() => downloadText(fileName, signed.signedKey)} aria-label={`Download ${fileName}`}>
              <i className="ri-download-2-line" aria-hidden="true" />
              <span className="hidden sm:inline">Download</span>
            </Button>
          )}
        />
        {certificate
          ? <CertificateDetails certificate={certificate} />
          : <Notice tone="warning">The console could not read the certificate details. Inspect it with <span className="font-mono">ssh-keygen -L -f {fileName}</span>.</Notice>}
        {host ? (
          <Notice title="Install on the host">
            Save it as <span className="font-mono">/etc/ssh/ssh_host_{fileName.replace(/^id_/, '').replace(/-cert\.pub$/, '')}_key-cert.pub</span>,
            add <span className="font-mono">HostCertificate</span> with that path to <span className="font-mono">sshd_config</span>, and reload sshd.
          </Notice>
        ) : (
          <div className="space-y-2">
            <p className="text-xs leading-5 text-foreground-600">
              Save it as <span className="font-mono">~/.ssh/{fileName}</span> next to the private key. OpenSSH picks it up on its own; to be explicit:
            </p>
            <CodeBlock id="ssh-hint" label="Connect" value={sshConnectHint(certificate?.keyType ?? publicKeyType, certificate?.principals[0])} copy={copy} wrap={false} />
          </div>
        )}
      </div>
    </section>
  );
}
