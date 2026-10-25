import { useState, type FormEvent } from 'react';

import { useDeleteIssuer, useSetDefaultIssuer, useUpdateIssuer } from '@/application/engines/pki/usePkiMutations';
import { usePkiIssuer, usePkiIssuerCrl, usePkiIssuers } from '@/application/engines/pki/usePkiQueries';
import { useToast } from '@/application/notifications/ToastContext';
import Badge from '@/components/base/Badge';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { Input } from '@/components/base/Input';
import {
  PKI_ISSUER_USAGES,
  PKI_LEAF_NOT_AFTER_BEHAVIORS,
  type PkiIssuer,
  type PkiLeafNotAfterBehavior,
} from '@/domain/engines/pki/pki';
import { issuerLabel, issuerNameError } from '@/domain/engines/pki/pki-helpers';
import { parseCrlPem, tryParseCertificate, type X509Crl } from '@/domain/engines/pki/x509';
import { CARD_CLASS, fileStem, formatEpochMs, joinPem, LINK_BUTTON_CLASS } from '../pki-format';
import CertificateSummary from './CertificateSummary';
import ExpiryBadge from './ExpiryBadge';
import { CheckboxField, FormSection, SelectField } from './FormControls';
import { ErrorNotice } from './Notices';
import { PemBlock } from './PemBlocks';

function IssuerSettings({ mount, issuer }: { readonly mount: string; readonly issuer: PkiIssuer }) {
  const toast = useToast();
  const mutation = useUpdateIssuer(mount, issuer.id);
  const [name, setName] = useState(issuer.name);
  const [usage, setUsage] = useState<readonly string[]>(issuer.usage);
  const [behavior, setBehavior] = useState(issuer.leafNotAfterBehavior as PkiLeafNotAfterBehavior);
  const nameError = issuerNameError(name);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (nameError) return;
    mutation.mutate({ name, usage, leafNotAfterBehavior: behavior }, {
      onSuccess: () => toast.success('Issuer settings saved.'),
    });
  };
  const toggleUsage = (value: string, enabled: boolean) => {
    setUsage((current) => (enabled ? [...current, value] : current.filter((item) => item !== value)));
  };
  return (
    <form onSubmit={submit} className={`${CARD_CLASS} space-y-4 p-4`} aria-label="Issuer settings">
      <FormSection title="Settings">
        <div className="grid gap-3 sm:grid-cols-2">
          <Input label="Issuer name" value={name} onChange={(event) => setName(event.target.value)} error={nameError} spellCheck={false} monospace />
          <SelectField
            label="When a request outlives this issuer"
            value={behavior}
            onChange={(event) => setBehavior(event.target.value as PkiLeafNotAfterBehavior)}
            options={PKI_LEAF_NOT_AFTER_BEHAVIORS.map((option) => ({ value: option.value, label: `${option.label}: ${option.description}` }))}
          />
        </div>
      </FormSection>
      <FormSection title="Allowed usage" description="Turn off issuing to retire an issuer while it keeps signing revocation lists.">
        <div className="grid gap-x-4 sm:grid-cols-2">
          {PKI_ISSUER_USAGES.map((option) => (
            <CheckboxField
              key={option.value}
              label={option.label}
              description={option.description}
              checked={usage.includes(option.value)}
              onChange={(checked) => toggleUsage(option.value, checked)}
            />
          ))}
        </div>
      </FormSection>
      {mutation.isError && <ErrorNotice title="Settings were not saved" error={mutation.error} permissionHint={`Your token needs update on ${mount}/issuer/${issuer.id}.`} />}
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="primary" loading={mutation.isPending}>Save settings</Button>
      </div>
    </form>
  );
}

function CrlInfo({ mount, issuer }: { readonly mount: string; readonly issuer: PkiIssuer }) {
  const [requested, setRequested] = useState(false);
  const crl = usePkiIssuerCrl(mount, issuer.id, requested);
  let parsed: X509Crl | undefined;
  let parseFailed = false;
  if (crl.data) {
    try {
      parsed = parseCrlPem(crl.data);
    } catch {
      parseFailed = true;
    }
  }
  return (
    <section aria-labelledby="issuer-crl" className={`${CARD_CLASS} space-y-3 p-4`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id="issuer-crl" className="text-xs font-semibold text-foreground-900">Revocation list</h3>
        {!requested && <Button size="sm" onClick={() => setRequested(true)}>Load CRL</Button>}
      </div>
      {!requested && <p className="text-xs text-foreground-500">Fetch the current CRL signed by this issuer.</p>}
      {requested && crl.isPending && <ContentSkeleton compact label="Loading CRL" />}
      {crl.isError && <ErrorNotice title="The CRL could not be read" error={crl.error} />}
      {parseFailed && <p className="text-xs text-warning-800">Vault returned a CRL the console could not read.</p>}
      {parsed && crl.data && (
        <>
          <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1 text-xs">
            <dt className="text-foreground-500">Last update</dt>
            <dd className="tabular-nums text-foreground-800">{formatEpochMs(parsed.thisUpdate)}</dd>
            <dt className="text-foreground-500">Next update</dt>
            <dd className="tabular-nums text-foreground-800">{parsed.nextUpdate ? formatEpochMs(parsed.nextUpdate) : 'Not set'}</dd>
            <dt className="text-foreground-500">Revoked entries</dt>
            <dd className="tabular-nums text-foreground-800">{parsed.revokedCount}</dd>
            {parsed.crlNumber && (
              <>
                <dt className="text-foreground-500">CRL number</dt>
                <dd className="tabular-nums text-foreground-800">{parsed.crlNumber}</dd>
              </>
            )}
          </dl>
          <PemBlock label="CRL" pem={crl.data} filename={`${fileStem(issuer.name || issuer.id)}.crl.pem`} collapsed />
        </>
      )}
    </section>
  );
}

function DeleteIssuerSection({ mount, issuer, onDeleted }: { readonly mount: string; readonly issuer: PkiIssuer; readonly onDeleted: (warnings: readonly string[]) => void }) {
  const [typed, setTyped] = useState('');
  const mutation = useDeleteIssuer(mount);
  const expected = issuer.name || issuer.id;
  return (
    <section aria-labelledby="issuer-danger" className="space-y-3 rounded-lg border border-danger-200 bg-danger-50/50 p-4">
      <div>
        <h3 id="issuer-danger" className="text-xs font-semibold text-danger-700">Delete issuer</h3>
        <p className="mt-1 text-xs leading-5 text-foreground-600">
          Removes the issuer certificate from this mount. Certificates it signed stay valid until they expire, but this
          mount can no longer revoke them or publish their CRL. Its key is kept and can be removed separately.
        </p>
      </div>
      <form
        className="space-y-3"
        onSubmit={(event) => {
          event.preventDefault();
          if (typed.trim() === expected) mutation.mutate(issuer.id, { onSuccess: onDeleted });
        }}
      >
        <Input label={`Type ${expected} to confirm`} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" spellCheck={false} monospace />
        {mutation.isError && <ErrorNotice title="The issuer was not deleted" error={mutation.error} permissionHint={`Your token needs delete on ${mount}/issuer/${issuer.id}.`} />}
        <Button type="submit" size="sm" variant="danger" disabled={typed.trim() !== expected} loading={mutation.isPending}>Delete issuer</Button>
      </form>
    </section>
  );
}

function ChainList({ issuer }: { readonly issuer: PkiIssuer }) {
  const chain = issuer.caChain.map((pem) => ({ pem, parsed: tryParseCertificate(pem) }));
  if (chain.length === 0) return null;
  return (
    <section aria-labelledby="issuer-chain" className={`${CARD_CLASS} space-y-3 p-4`}>
      <h3 id="issuer-chain" className="text-xs font-semibold text-foreground-900">Chain</h3>
      <ol className="space-y-1.5">
        {chain.map(({ pem, parsed }, index) => (
          <li key={pem} className="flex flex-wrap items-center gap-2 text-xs" style={{ paddingLeft: `${index * 12}px` }}>
            <i className={`${index === 0 ? 'ri-shield-keyhole-line' : 'ri-corner-down-right-line'} text-foreground-400`} aria-hidden="true" />
            <span className="font-medium text-foreground-800">{parsed?.subject.commonName ?? parsed?.subject.text ?? 'Unreadable certificate'}</span>
            {parsed && <ExpiryBadge validity={parsed} />}
          </li>
        ))}
      </ol>
      <PemBlock label="Full chain" pem={joinPem(issuer.caChain)} filename={`${fileStem(issuer.name || issuer.id)}-chain.pem`} collapsed />
    </section>
  );
}

/** One issuer: parsed certificate, chain, settings, CRL, and deletion. */
export default function IssuerDetail({ mount, issuerRef, onBack }: {
  readonly mount: string;
  readonly issuerRef: string;
  readonly onBack: () => void;
}) {
  const toast = useToast();
  const issuers = usePkiIssuers(mount);
  const query = usePkiIssuer(mount, issuerRef);
  const setDefault = useSetDefaultIssuer(mount);
  const summary = issuers.data?.find((item) => item.id === query.data?.id);
  const back = (
    <button type="button" className={LINK_BUTTON_CLASS} onClick={onBack}>
      <i className="ri-arrow-left-s-line" aria-hidden="true" />
      All issuers
    </button>
  );

  if (query.isPending) return <div className="space-y-3">{back}<ContentSkeleton variant="detail" label="Loading issuer" /></div>;
  if (query.isError) {
    return <div className="space-y-3">{back}<ErrorNotice title="The issuer could not be read" error={query.error} permissionHint={`Your token needs read on ${mount}/issuer/${issuerRef}.`} /></div>;
  }

  const issuer = query.data;
  const certificate = tryParseCertificate(issuer.certificate);
  const stem = fileStem(issuer.name || certificate?.subject.commonName || issuer.id);
  return (
    <div className="space-y-4">
      {back}
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="truncate text-sm font-semibold text-foreground-900">{certificate?.subject.commonName ?? issuerLabel(issuer)}</h2>
            {summary?.isDefault && <Badge variant="info">Default</Badge>}
            {issuer.revoked && <Badge variant="danger">Revoked</Badge>}
          </div>
          <p className="mt-0.5 break-all font-mono text-[11px] text-foreground-500">{issuer.id}</p>
        </div>
        {summary && !summary.isDefault && (
          <Button
            size="sm"
            loading={setDefault.isPending}
            onClick={() => setDefault.mutate(issuer.id, {
              onSuccess: () => toast.success('Default issuer updated.'),
              onError: () => toast.error('The default issuer was not changed.', { title: 'Update failed' }),
            })}
          >
            <i className="ri-star-line" aria-hidden="true" />
            Make default
          </Button>
        )}
      </header>
      <section aria-label="Certificate" className={`${CARD_CLASS} space-y-3 p-4`}>
        {certificate ? <CertificateSummary certificate={certificate} revoked={issuer.revoked} /> : <p className="text-xs text-warning-800">The certificate could not be read.</p>}
        <PemBlock label="Certificate" pem={issuer.certificate} filename={`${stem}.pem`} collapsed />
      </section>
      <ChainList issuer={issuer} />
      <IssuerSettings key={`${issuer.id}-${issuer.name}-${issuer.usage.join()}`} mount={mount} issuer={issuer} />
      <CrlInfo mount={mount} issuer={issuer} />
      <DeleteIssuerSection mount={mount} issuer={issuer} onDeleted={(warnings) => {
        toast.success('Issuer deleted.');
        warnings.forEach((warning) => toast.warning(warning, { title: 'Vault warning' }));
        onBack();
      }} />
    </div>
  );
}
