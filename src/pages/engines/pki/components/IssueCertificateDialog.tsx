import { useState, type FormEvent } from 'react';

import { useIssueCertificate, useSignCertificate } from '@/application/engines/pki/usePkiMutations';
import Button from '@/components/base/Button';
import { Input, Textarea } from '@/components/base/Input';
import Modal from '@/components/base/Modal';
import type { PkiCertificateFormat, PkiIssuedCertificate, PkiPrivateKeyFormat, PkiRole } from '@/domain/engines/pki/pki';
import { ipListError, roleDomainSummary, ttlError } from '@/domain/engines/pki/pki-helpers';
import { pemBlocks } from '@/domain/engines/pki/x509';
import { DialogFooter, SelectField } from './FormControls';
import { ErrorNotice } from './Notices';
import SignedCertificateResult from './SignedCertificateResult';
import { useKeyCloseGuard } from './useKeyCloseGuard';

export type CertificateRequestMode = 'issue' | 'sign';

interface RequestForm {
  readonly commonName: string;
  readonly altNames: string;
  readonly ipSans: string;
  readonly ttl: string;
  readonly format: PkiCertificateFormat;
  readonly privateKeyFormat: PkiPrivateKeyFormat;
  readonly csr: string;
}

const EMPTY_FORM: RequestForm = { commonName: '', altNames: '', ipSans: '', ttl: '', format: 'pem', privateKeyFormat: '', csr: '' };

function csrError(csr: string): string | undefined {
  if (!csr.trim()) return 'Paste a certificate signing request.';
  try {
    return pemBlocks(csr).some((block) => block.label === 'CERTIFICATE REQUEST' || block.label === 'NEW CERTIFICATE REQUEST')
      ? undefined
      : 'This is not a PEM certificate signing request.';
  } catch {
    return 'This is not a PEM certificate signing request.';
  }
}

function formErrors(form: RequestForm, mode: CertificateRequestMode, role: PkiRole) {
  const errors = {
    commonName: mode === 'issue' && role.requireCn && !form.commonName.trim() ? 'Enter a common name.' : undefined,
    ipSans: ipListError(form.ipSans) ?? (form.ipSans.trim() && !role.allowIpSans ? 'This role does not allow IP addresses.' : undefined),
    ttl: ttlError(form.ttl),
    csr: mode === 'sign' ? csrError(form.csr) : undefined,
  };
  return { errors, valid: Object.values(errors).every((value) => !value) };
}

function RequestFields({ mode, role, form, errors, onChange }: {
  readonly mode: CertificateRequestMode;
  readonly role: PkiRole;
  readonly form: RequestForm;
  readonly errors: Partial<Record<keyof RequestForm, string>>;
  readonly onChange: (patch: Partial<RequestForm>) => void;
}) {
  return (
    <div className="space-y-3">
      <p className="text-xs leading-5 text-foreground-600">
        Role <span className="font-mono">{role.name}</span> allows: {roleDomainSummary(role)}.
      </p>
      {mode === 'sign' && (
        <Textarea label="Certificate signing request (PEM)" value={form.csr} onChange={(event) => onChange({ csr: event.target.value })} rows={7} placeholder="-----BEGIN CERTIFICATE REQUEST-----" error={errors.csr} spellCheck={false} monospace />
      )}
      <Input
        label={mode === 'sign' ? 'Common name (optional)' : 'Common name'}
        value={form.commonName}
        onChange={(event) => onChange({ commonName: event.target.value })}
        error={errors.commonName}
        placeholder="app.example.com"
        hint={mode === 'sign' ? 'Empty uses the name in the request when the role allows it.' : undefined}
        spellCheck={false}
        autoComplete="off"
        monospace
      />
      <div className="grid gap-3 sm:grid-cols-2">
        <Input label="Alternative names" value={form.altNames} onChange={(event) => onChange({ altNames: event.target.value })} placeholder="api.example.com" hint="Comma-separated DNS names or emails." spellCheck={false} monospace />
        <Input label="IP addresses" value={form.ipSans} onChange={(event) => onChange({ ipSans: event.target.value })} error={errors.ipSans} hint="Comma-separated." spellCheck={false} monospace />
        <Input label="TTL" value={form.ttl} onChange={(event) => onChange({ ttl: event.target.value })} error={errors.ttl} placeholder="Role default" spellCheck={false} monospace />
        <SelectField
          label="Format"
          value={form.format}
          onChange={(event) => onChange({ format: event.target.value as PkiCertificateFormat })}
          options={[
            { value: 'pem', label: 'PEM: separate files' },
            { value: 'pem_bundle', label: mode === 'issue' ? 'PEM bundle: also one combined file' : 'PEM bundle: certificate with issuer' },
          ]}
        />
        {mode === 'issue' && (
          <SelectField
            label="Private key encoding"
            value={form.privateKeyFormat}
            onChange={(event) => onChange({ privateKeyFormat: event.target.value as PkiPrivateKeyFormat })}
            options={[{ value: '', label: 'Default (PKCS#1 or SEC 1)' }, { value: 'pkcs8', label: 'PKCS#8' }]}
          />
        )}
      </div>
    </div>
  );
}

/** Issues a certificate with a new key, or signs a CSR, from one role. */
export default function IssueCertificateDialog({ mount, role, mode, open, onClose }: {
  readonly mount: string;
  readonly role: PkiRole;
  readonly mode: CertificateRequestMode;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const [form, setForm] = useState<RequestForm>(EMPTY_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const [result, setResult] = useState<{ readonly certificate: PkiIssuedCertificate; readonly bundle: boolean }>();
  const issue = useIssueCertificate(mount, role.name);
  const sign = useSignCertificate(mount, role.name);
  const mutation = mode === 'issue' ? issue : sign;
  const guard = useKeyCloseGuard(Boolean(result?.certificate.privateKey));
  const { errors, valid } = formErrors(form, mode, role);

  const close = async () => {
    if (mutation.isPending || !(await guard.confirmClose())) return;
    setForm(EMPTY_FORM);
    setResult(undefined);
    setShowErrors(false);
    guard.reset();
    issue.reset();
    sign.reset();
    onClose();
  };
  const onSuccess = (certificate: PkiIssuedCertificate) => {
    setResult({ certificate, bundle: form.format === 'pem_bundle' });
    issue.reset();
    sign.reset();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (!valid) return;
    const common = { commonName: form.commonName, altNames: form.altNames, ipSans: form.ipSans, ttl: form.ttl, format: form.format };
    if (mode === 'issue') issue.mutate({ ...common, privateKeyFormat: form.privateKeyFormat }, { onSuccess });
    else sign.mutate({ ...common, csr: form.csr }, { onSuccess });
  };

  const verb = mode === 'issue' ? 'Issue certificate' : 'Sign request';
  return (
    <>
      <Modal open={open} onClose={() => void close()} title={result ? (mode === 'issue' ? 'Certificate issued' : 'Request signed') : verb} width="lg">
        {result ? (
          <>
            <div className="p-4">
              <SignedCertificateResult result={result.certificate} bundle={result.bundle} onKeySaved={guard.markSaved} />
            </div>
            <DialogFooter><Button size="sm" variant="primary" onClick={() => void close()}>Done</Button></DialogFooter>
          </>
        ) : (
          <form onSubmit={submit} noValidate>
            <div className="space-y-4 p-4">
              <RequestFields mode={mode} role={role} form={form} errors={showErrors ? errors : {}} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
              {mutation.isError && (
                <ErrorNotice
                  title={mode === 'issue' ? 'No certificate was issued' : 'The request was not signed'}
                  error={mutation.error}
                  permissionHint={`Your token needs update on ${mount}/${mode}/${role.name}.`}
                />
              )}
            </div>
            <DialogFooter>
              <Button type="button" size="sm" onClick={() => void close()} disabled={mutation.isPending}>Cancel</Button>
              <Button type="submit" size="sm" variant="primary" loading={mutation.isPending}>{verb}</Button>
            </DialogFooter>
          </form>
        )}
      </Modal>
      {guard.dialog}
    </>
  );
}
