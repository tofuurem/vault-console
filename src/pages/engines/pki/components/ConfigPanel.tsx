import { useState, type FormEvent, type ReactNode } from 'react';

import { useRotateCrl, useSaveCrlConfig, useSaveUrls, useTidy } from '@/application/engines/pki/usePkiMutations';
import { usePkiCrlConfig, usePkiTidyStatus, usePkiUrls } from '@/application/engines/pki/usePkiQueries';
import { useToast } from '@/application/notifications/ToastContext';
import Badge from '@/components/base/Badge';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { Input, Textarea } from '@/components/base/Input';
import type { PkiCrlConfig, PkiTidyStatus, PkiUrlsConfig } from '@/domain/engines/pki/pki';
import { splitList, ttlError } from '@/domain/engines/pki/pki-helpers';
import { CARD_CLASS, formatDateTimeText, pkiErrorText } from '../pki-format';
import { CheckboxField } from './FormControls';
import { ErrorNotice } from './Notices';

function Card({ title, description, children }: { readonly title: string; readonly description: string; readonly children: ReactNode }) {
  const id = `pki-config-${title.toLowerCase().replace(/\W+/g, '-')}`;
  return (
    <section aria-labelledby={id} className={`${CARD_CLASS} space-y-4 p-4`}>
      <div>
        <h3 id={id} className="text-xs font-semibold text-foreground-900">{title}</h3>
        <p className="mt-0.5 text-xs leading-5 text-foreground-600">{description}</p>
      </div>
      {children}
    </section>
  );
}

function stateVariant(state: string) {
  if (state === 'Finished') return 'success' as const;
  if (state === 'Error' || state === 'Cancelled') return 'danger' as const;
  if (state === 'Running') return 'info' as const;
  return 'default' as const;
}

function TidyStatusView({ status }: { readonly status: PkiTidyStatus }) {
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 rounded-md bg-background-100 px-3 py-2 text-xs">
      <dt className="text-foreground-500">Last run</dt>
      <dd><Badge variant={stateVariant(status.state)}>{status.state}</Badge></dd>
      {status.timeStarted && (<><dt className="text-foreground-500">Started</dt><dd className="tabular-nums text-foreground-800">{formatDateTimeText(status.timeStarted)}</dd></>)}
      {status.timeFinished && (<><dt className="text-foreground-500">Finished</dt><dd className="tabular-nums text-foreground-800">{formatDateTimeText(status.timeFinished)}</dd></>)}
      {status.certStoreDeletedCount !== undefined && (<><dt className="text-foreground-500">Certificates removed</dt><dd className="tabular-nums text-foreground-800">{status.certStoreDeletedCount}</dd></>)}
      {status.revokedCertDeletedCount !== undefined && (<><dt className="text-foreground-500">Revoked entries removed</dt><dd className="tabular-nums text-foreground-800">{status.revokedCertDeletedCount}</dd></>)}
      {status.error && (<><dt className="text-foreground-500">Error</dt><dd className="break-words text-danger-700">{status.error}</dd></>)}
    </dl>
  );
}

function TidySection({ mount }: { readonly mount: string }) {
  const toast = useToast();
  const status = usePkiTidyStatus(mount, true);
  const tidy = useTidy(mount);
  const [certStore, setCertStore] = useState(true);
  const [revoked, setRevoked] = useState(true);
  const [issuers, setIssuers] = useState(false);
  const [buffer, setBuffer] = useState('72h');
  const bufferError = ttlError(buffer);
  const nothingSelected = !certStore && !revoked && !issuers;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (bufferError || nothingSelected) return;
    tidy.mutate({ tidyCertStore: certStore, tidyRevokedCerts: revoked, tidyExpiredIssuers: issuers, safetyBuffer: buffer }, {
      onSuccess: () => toast.success('Tidy started. Vault runs it in the background.'),
    });
  };
  return (
    <Card title="Tidy" description="Remove expired certificates and old revocation entries so storage and CRLs stay small.">
      {status.isPending && <ContentSkeleton compact label="Loading tidy status" />}
      {status.data && <TidyStatusView status={status.data} />}
      {status.isError && <ErrorNotice title="Tidy status could not be read" error={status.error} permissionHint={`Your token needs read on ${mount}/tidy-status.`} />}
      <form onSubmit={submit} className="space-y-3">
        <div className="grid gap-x-4 sm:grid-cols-3">
          <CheckboxField label="Expired certificates" checked={certStore} onChange={setCertStore} />
          <CheckboxField label="Revoked certificates" description="Once past expiry" checked={revoked} onChange={setRevoked} />
          <CheckboxField label="Expired issuers" description="Uses a one-year buffer by default" checked={issuers} onChange={setIssuers} />
        </div>
        <div className="max-w-xs">
          <Input label="Safety buffer" value={buffer} onChange={(event) => setBuffer(event.target.value)} error={bufferError} hint="Only remove items expired for longer than this." spellCheck={false} monospace />
        </div>
        {nothingSelected && <p className="text-xs text-foreground-500">Choose at least one thing to tidy.</p>}
        {tidy.isError && <ErrorNotice title="Tidy did not start" error={tidy.error} permissionHint={`Your token needs update on ${mount}/tidy.`} />}
        <div className="flex flex-wrap justify-end gap-2">
          <Button type="button" size="sm" variant="ghost" onClick={() => void status.refetch()} loading={status.isFetching && !status.isPending}>Refresh status</Button>
          <Button type="submit" size="sm" variant="primary" loading={tidy.isPending} disabled={nothingSelected}>Run tidy</Button>
        </div>
      </form>
    </Card>
  );
}

function UrlsForm({ mount, initial }: { readonly mount: string; readonly initial: PkiUrlsConfig }) {
  const toast = useToast();
  const save = useSaveUrls(mount);
  const [issuing, setIssuing] = useState(initial.issuingCertificates.join('\n'));
  const [crl, setCrl] = useState(initial.crlDistributionPoints.join('\n'));
  const [ocsp, setOcsp] = useState(initial.ocspServers.join('\n'));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    save.mutate({ issuingCertificates: splitList(issuing), crlDistributionPoints: splitList(crl), ocspServers: splitList(ocsp) }, {
      onSuccess: () => toast.success('Distribution URLs saved.'),
    });
  };
  const field = (label: string, value: string, onChange: (value: string) => void, placeholder: string) => (
    <Textarea label={label} value={value} onChange={(event) => onChange(event.target.value)} rows={2} placeholder={placeholder} spellCheck={false} monospace />
  );
  return (
    <form onSubmit={submit} className="space-y-3">
      {field('Issuing certificate URLs', issuing, setIssuing, `https://vault.example.com/v1/${mount}/ca`)}
      {field('CRL distribution points', crl, setCrl, `https://vault.example.com/v1/${mount}/crl`)}
      {field('OCSP servers', ocsp, setOcsp, `https://vault.example.com/v1/${mount}/ocsp`)}
      <p className="text-[11px] leading-4 text-foreground-500">One URL per line. Changes apply to certificates issued from now on.</p>
      {save.isError && <ErrorNotice title="URLs were not saved" error={save.error} permissionHint={`Your token needs update on ${mount}/config/urls.`} />}
      <div className="flex justify-end"><Button type="submit" size="sm" variant="primary" loading={save.isPending}>Save URLs</Button></div>
    </form>
  );
}

function UrlsSection({ mount }: { readonly mount: string }) {
  const urls = usePkiUrls(mount, true);
  return (
    <Card title="Distribution URLs" description="Written into issued certificates so clients can find the issuing CA, the CRL, and OCSP.">
      {urls.isPending && <ContentSkeleton compact label="Loading URLs" />}
      {urls.isError && <ErrorNotice title="URLs could not be read" error={urls.error} permissionHint={`Your token needs read on ${mount}/config/urls.`} />}
      {urls.data && <UrlsForm key={JSON.stringify(urls.data)} mount={mount} initial={urls.data} />}
    </Card>
  );
}

function CrlForm({ mount, initial }: { readonly mount: string; readonly initial: PkiCrlConfig }) {
  const toast = useToast();
  const save = useSaveCrlConfig(mount);
  const rotate = useRotateCrl(mount);
  const [expiry, setExpiry] = useState(initial.expiry);
  const [disable, setDisable] = useState(initial.disable);
  const [autoRebuild, setAutoRebuild] = useState(initial.autoRebuild);
  const expiryError = ttlError(expiry);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (expiryError) return;
    save.mutate({ expiry, disable, autoRebuild }, { onSuccess: () => toast.success('CRL settings saved.') });
  };
  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="max-w-xs">
        <Input label="CRL lifetime" value={expiry} onChange={(event) => setExpiry(event.target.value)} error={expiryError} hint="How long a published CRL stays valid." spellCheck={false} monospace />
      </div>
      <div className="grid gap-x-4 sm:grid-cols-2">
        <CheckboxField label="Rebuild automatically" description="Vault refreshes the CRL before it expires." checked={autoRebuild} onChange={setAutoRebuild} />
        <CheckboxField label="Disable the CRL" description="Clients can no longer learn about revocations from it." checked={disable} onChange={setDisable} />
      </div>
      {save.isError && <ErrorNotice title="CRL settings were not saved" error={save.error} permissionHint={`Your token needs update on ${mount}/config/crl.`} />}
      <div className="flex flex-wrap justify-end gap-2">
        <Button
          type="button"
          size="sm"
          loading={rotate.isPending}
          onClick={() => rotate.mutate(undefined, {
            onSuccess: () => toast.success('The CRL was rebuilt.'),
            onError: (error) => toast.error(pkiErrorText(error).details[0] ?? pkiErrorText(error).message, { title: 'Rebuild failed' }),
          })}
        >
          <i className="ri-refresh-line" aria-hidden="true" />
          Rebuild CRL now
        </Button>
        <Button type="submit" size="sm" variant="primary" loading={save.isPending}>Save CRL settings</Button>
      </div>
    </form>
  );
}

function CrlSection({ mount }: { readonly mount: string }) {
  const config = usePkiCrlConfig(mount, true);
  return (
    <Card title="Revocation list" description="Controls how long CRLs are valid and whether Vault rebuilds them for you.">
      {config.isPending && <ContentSkeleton compact label="Loading CRL settings" />}
      {config.isError && <ErrorNotice title="CRL settings could not be read" error={config.error} permissionHint={`Your token needs read on ${mount}/config/crl.`} />}
      {config.data && <CrlForm key={JSON.stringify(config.data)} mount={mount} initial={config.data} />}
    </Card>
  );
}

/** Mount-wide maintenance: tidy, distribution URLs, and CRL settings. */
export default function ConfigPanel({ mount }: { readonly mount: string }) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <div className="space-y-4">
        <TidySection mount={mount} />
      </div>
      <div className="space-y-4">
        <UrlsSection mount={mount} />
        <CrlSection mount={mount} />
      </div>
    </div>
  );
}
