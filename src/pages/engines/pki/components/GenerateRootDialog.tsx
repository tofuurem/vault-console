import { useState, type FormEvent } from 'react';

import { useGenerateRoot } from '@/application/engines/pki/usePkiMutations';
import Button from '@/components/base/Button';
import Modal from '@/components/base/Modal';
import type { PkiGeneratedRoot } from '@/domain/engines/pki/pki';
import { tryParseCertificate } from '@/domain/engines/pki/x509';
import { caFormErrors, caSubject, EMPTY_CA_FORM, pathLengthValue, type CaFormState } from '../ca-form';
import { fileStem } from '../pki-format';
import CaSubjectFields from './CaSubjectFields';
import CertificateSummary from './CertificateSummary';
import { DialogFooter } from './FormControls';
import { ErrorNotice, WarningList } from './Notices';
import { PemBlock, PrivateKeyPanel } from './PemBlocks';
import { useKeyCloseGuard } from './useKeyCloseGuard';

function RootResult({ result, onKeySaved }: { readonly result: PkiGeneratedRoot; readonly onKeySaved: () => void }) {
  const parsed = tryParseCertificate(result.certificate);
  const stem = fileStem(result.issuerName || parsed?.subject.commonName || 'root-ca');
  return (
    <div className="space-y-4 p-4">
      <p role="status" className="flex items-start gap-2 rounded-md border border-success-200 bg-success-50 px-3 py-2 text-xs leading-5 text-success-800">
        <i className="ri-checkbox-circle-line mt-0.5 shrink-0" aria-hidden="true" />
        <span>The root CA is ready and is now an issuer on this mount. Next, create a role to issue certificates.</span>
      </p>
      <WarningList warnings={result.warnings} />
      {result.privateKey && <PrivateKeyPanel privateKey={result.privateKey} filename={`${stem}.key.pem`} onSaved={onKeySaved} />}
      {parsed && <CertificateSummary certificate={parsed} />}
      <PemBlock label="Certificate" pem={result.certificate} filename={`${stem}.pem`} collapsed />
    </div>
  );
}

/** Generates a self-signed root CA on this mount. */
export default function GenerateRootDialog({ mount, open, onClose, onCreated }: {
  readonly mount: string;
  readonly open: boolean;
  readonly onClose: () => void;
  /** Called when the operator leaves the result view, with the new issuer id. */
  readonly onCreated: (issuerId: string) => void;
}) {
  const [form, setForm] = useState<CaFormState>(EMPTY_CA_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const [result, setResult] = useState<PkiGeneratedRoot>();
  const mutation = useGenerateRoot(mount);
  const guard = useKeyCloseGuard(Boolean(result?.privateKey));
  const errors = caFormErrors(form);

  const reset = () => {
    setForm(EMPTY_CA_FORM);
    setShowErrors(false);
    setResult(undefined);
    guard.reset();
    mutation.reset();
  };
  const close = async () => {
    if (mutation.isPending || !(await guard.confirmClose())) return;
    const created = result?.issuerId;
    reset();
    if (created) onCreated(created);
    else onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (Object.keys(errors).length > 0) return;
    mutation.mutate({
      ...caSubject(form),
      exportKey: form.exportKey,
      issuerName: form.issuerName,
      ttl: form.ttl,
      maxPathLength: pathLengthValue(form.maxPathLength),
    }, {
      onSuccess: (generated) => {
        setResult(generated);
        mutation.reset();
      },
    });
  };

  return (
    <>
    <Modal open={open} onClose={() => void close()} title={result ? 'Root CA created' : 'Create a root CA'} width="lg">
      {result ? (
        <>
          <RootResult result={result} onKeySaved={guard.markSaved} />
          <DialogFooter>
            <Button size="sm" variant="primary" onClick={() => void close()}>Done</Button>
          </DialogFooter>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="space-y-4 p-4">
            <p className="text-xs leading-5 text-foreground-600">
              A root CA signs itself. Keep its lifetime long and use it to sign intermediates, or issue
              certificates from it directly for small setups.
            </p>
            <CaSubjectFields kind="root" form={form} errors={showErrors ? errors : {}} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
            {mutation.isError && <ErrorNotice title="Root CA was not created" error={mutation.error} permissionHint={`Your token needs update on ${mount}/root/generate.`} />}
          </div>
          <DialogFooter>
            <Button type="button" size="sm" onClick={() => void close()} disabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" size="sm" variant="primary" loading={mutation.isPending}>Create root CA</Button>
          </DialogFooter>
        </form>
      )}
    </Modal>
    {guard.dialog}
    </>
  );
}
