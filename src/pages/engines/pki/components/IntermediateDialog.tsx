import { useState, type FormEvent } from 'react';

import {
  useGenerateIntermediate,
  useSetSignedIntermediate,
  useSignIntermediate,
} from '@/application/engines/pki/usePkiMutations';
import { useSecretEngines } from '@/application/engines/useSecretEngines';
import Button from '@/components/base/Button';
import { Input, Textarea } from '@/components/base/Input';
import Modal from '@/components/base/Modal';
import type { PkiGeneratedCsr, PkiImportResult } from '@/domain/engines/pki/pki';
import { ttlError } from '@/domain/engines/pki/pki-helpers';
import { certificatePems, tryParseCertificate } from '@/domain/engines/pki/x509';
import { caFormErrors, caSubject, EMPTY_CA_FORM, pathLengthValue, type CaFormState } from '../ca-form';
import { fileStem, joinPem } from '../pki-format';
import CaSubjectFields from './CaSubjectFields';
import { ChoiceCards, DialogFooter, SelectField } from './FormControls';
import { ErrorNotice, WarningList } from './Notices';
import { PemBlock, PrivateKeyPanel } from './PemBlocks';
import { useKeyCloseGuard } from './useKeyCloseGuard';

type SignMethod = 'mount' | 'paste';

interface SignState {
  readonly method: SignMethod;
  readonly rootMount: string;
  readonly issuerRef: string;
  readonly ttl: string;
  readonly maxPathLength: string;
  readonly signedPem: string;
}

function signedPemError(pem: string): string | undefined {
  if (!pem.trim()) return 'Paste the signed certificate.';
  const certificate = tryParseCertificate(pem);
  if (!certificate) return 'This is not a PEM certificate.';
  return certificate.isCa ? undefined : 'This certificate is not a CA certificate.';
}

function SignStep({ mount, csr, state, onChange, showErrors }: {
  readonly mount: string;
  readonly csr: PkiGeneratedCsr;
  readonly state: SignState;
  readonly onChange: (patch: Partial<SignState>) => void;
  readonly showErrors: boolean;
}) {
  const engines = useSecretEngines();
  const otherMounts = (engines.data ?? []).filter((engine) => engine.kind === 'pki' && engine.path !== mount);
  return (
    <div className="space-y-4">
      <PemBlock label="Certificate signing request" pem={csr.csr} filename={`${fileStem(mount)}-intermediate.csr`} />
      <ChoiceCards
        label="How should the request be signed?"
        value={state.method}
        onChange={(method) => onChange({ method })}
        options={[
          { value: 'mount', label: 'Another PKI mount here', description: otherMounts.length ? 'Sign with a root on a mount this token can see.' : 'No other PKI mount is visible to this token.', icon: 'ri-git-merge-line' },
          { value: 'paste', label: 'An external CA', description: 'Copy the request above, have it signed, and paste the result.', icon: 'ri-clipboard-line' },
        ]}
      />
      {state.method === 'mount' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <SelectField
            label="Signing mount"
            value={state.rootMount}
            onChange={(event) => onChange({ rootMount: event.target.value })}
            options={[{ value: '', label: otherMounts.length ? 'Choose a mount' : 'None available' }, ...otherMounts.map((engine) => ({ value: engine.path, label: `${engine.path}/` }))]}
          />
          <Input label="Issuer on that mount" value={state.issuerRef} onChange={(event) => onChange({ issuerRef: event.target.value })} placeholder="default" hint="Empty uses its default issuer." spellCheck={false} monospace />
          <Input label="Lifetime (TTL)" value={state.ttl} onChange={(event) => onChange({ ttl: event.target.value })} error={showErrors ? ttlError(state.ttl) : undefined} spellCheck={false} monospace />
          <Input label="Max path length" value={state.maxPathLength} onChange={(event) => onChange({ maxPathLength: event.target.value })} hint="0 stops this intermediate from signing further CAs." inputMode="numeric" />
        </div>
      ) : (
        <Textarea
          label="Signed certificate (PEM)"
          value={state.signedPem}
          onChange={(event) => onChange({ signedPem: event.target.value })}
          rows={8}
          spellCheck={false}
          placeholder="-----BEGIN CERTIFICATE-----"
          error={showErrors ? signedPemError(state.signedPem) : undefined}
          monospace
        />
      )}
    </div>
  );
}

function DoneStep({ result, certificate }: { readonly result: PkiImportResult; readonly certificate?: string }) {
  const parsed = tryParseCertificate(certificate);
  return (
    <div className="space-y-3">
      <p role="status" className="flex items-start gap-2 rounded-md border border-success-200 bg-success-50 px-3 py-2 text-xs leading-5 text-success-800">
        <i className="ri-checkbox-circle-line mt-0.5 shrink-0" aria-hidden="true" />
        <span>
          The intermediate CA is installed{parsed?.subject.commonName ? ` as ${parsed.subject.commonName}` : ''}.
          {' '}{result.importedIssuers.length} issuer{result.importedIssuers.length === 1 ? ' was' : 's were'} imported.
        </span>
      </p>
      <WarningList warnings={result.warnings} />
    </div>
  );
}

function SignForm({ mount, csr, keyFilename, sign, onChange, showErrors, pending, failure, onSubmit, onCancel, onKeySaved }: {
  readonly mount: string;
  readonly csr: PkiGeneratedCsr;
  readonly keyFilename: string;
  readonly sign: SignState;
  readonly onChange: (patch: Partial<SignState>) => void;
  readonly showErrors: boolean;
  readonly pending: boolean;
  readonly failure: unknown;
  readonly onSubmit: (event: FormEvent) => void;
  readonly onCancel: () => void;
  readonly onKeySaved: () => void;
}) {
  return (
    <form onSubmit={onSubmit} noValidate>
      <div className="space-y-4 p-4">
        <WarningList warnings={csr.warnings} />
        {csr.privateKey && <PrivateKeyPanel privateKey={csr.privateKey} filename={keyFilename} onSaved={onKeySaved} />}
        <SignStep mount={mount} csr={csr} state={sign} onChange={onChange} showErrors={showErrors} />
        {showErrors && sign.method === 'mount' && !sign.rootMount && (
          <p role="alert" className="text-xs text-danger-600">Choose the mount that should sign this request.</p>
        )}
        {failure !== null && failure !== undefined && (
          <ErrorNotice
            title="The intermediate was not installed"
            error={failure}
            permissionHint={`Signing needs update on the signing mount's root/sign-intermediate path. Installing needs update on ${mount}/intermediate/set-signed.`}
          />
        )}
      </div>
      <DialogFooter>
        <Button type="button" size="sm" onClick={onCancel} disabled={pending}>Cancel</Button>
        <Button type="submit" size="sm" variant="primary" loading={pending}>
          {sign.method === 'mount' ? 'Sign and install' : 'Install certificate'}
        </Button>
      </DialogFooter>
    </form>
  );
}

const INITIAL_SIGN: SignState = { method: 'mount', rootMount: '', issuerRef: '', ttl: '43800h', maxPathLength: '', signedPem: '' };

/** Creates an intermediate CA: generate a CSR here, then sign it on another mount or externally. */
export default function IntermediateDialog({ mount, open, onClose, onCreated }: {
  readonly mount: string;
  readonly open: boolean;
  readonly onClose: () => void;
  readonly onCreated: () => void;
}) {
  const [form, setForm] = useState<CaFormState>({ ...EMPTY_CA_FORM, ttl: '' });
  const [sign, setSign] = useState<SignState>(INITIAL_SIGN);
  const [showErrors, setShowErrors] = useState(false);
  const [csr, setCsr] = useState<PkiGeneratedCsr>();
  const [done, setDone] = useState<{ readonly result: PkiImportResult; readonly certificate: string }>();
  // Kept so a failed install can be retried without signing a second certificate.
  const [signedBundle, setSignedBundle] = useState<string>();
  const generate = useGenerateIntermediate(mount);
  const signOnMount = useSignIntermediate();
  const setSigned = useSetSignedIntermediate(mount);
  const guard = useKeyCloseGuard(Boolean(csr?.privateKey));
  const formErrors = caFormErrors(form);
  const pending = generate.isPending || signOnMount.isPending || setSigned.isPending;
  const failure = generate.error ?? signOnMount.error ?? setSigned.error;

  const reset = () => {
    setForm({ ...EMPTY_CA_FORM, ttl: '' });
    setSign(INITIAL_SIGN);
    setShowErrors(false);
    setCsr(undefined);
    setDone(undefined);
    setSignedBundle(undefined);
    guard.reset();
    [generate, signOnMount, setSigned].forEach((mutation) => mutation.reset());
  };
  const close = async () => {
    if (pending || !(await guard.confirmClose())) return;
    const finished = Boolean(done);
    reset();
    if (finished) onCreated();
    else onClose();
  };

  const submitForm = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (Object.keys(formErrors).length > 0) return;
    generate.mutate({ ...caSubject(form), exportKey: form.exportKey }, {
      onSuccess: (generated) => {
        setCsr(generated);
        setShowErrors(false);
        generate.reset();
      },
    });
  };
  const install = (certificate: string) => setSigned.mutate(certificate, {
    onSuccess: (result) => setDone({ result, certificate }),
  });
  const submitSign = (event: FormEvent) => {
    event.preventDefault();
    if (!csr) return;
    setShowErrors(true);
    if (sign.method === 'paste') {
      if (!signedPemError(sign.signedPem)) install(sign.signedPem);
      return;
    }
    if (signedBundle) {
      install(signedBundle);
      return;
    }
    if (!sign.rootMount || ttlError(sign.ttl)) return;
    signOnMount.mutate({
      rootMount: sign.rootMount,
      input: {
        csr: csr.csr,
        commonName: form.commonName,
        issuerRef: sign.issuerRef,
        ttl: sign.ttl,
        maxPathLength: pathLengthValue(sign.maxPathLength),
      },
    }, {
      // Install the intermediate together with its issuer so Vault can build the chain.
      onSuccess: (signed) => {
        const bundle = joinPem([signed.certificate, ...certificatePems(joinPem(signed.caChain))]);
        setSignedBundle(bundle);
        install(bundle);
      },
    });
  };

  const title = done ? 'Intermediate CA installed' : csr ? 'Sign the intermediate' : 'Create an intermediate CA';
  return (
    <>
      <Modal open={open} onClose={() => void close()} title={title} width="lg">
        {done && (
          <>
            <div className="space-y-4 p-4">
              <DoneStep result={done.result} certificate={done.certificate} />
              {/* The exported key stays available until the dialog closes. */}
              {csr?.privateKey && <PrivateKeyPanel privateKey={csr.privateKey} filename={`${fileStem(form.commonName, 'intermediate')}.key.pem`} onSaved={guard.markSaved} />}
            </div>
            <DialogFooter><Button size="sm" variant="primary" onClick={() => void close()}>Done</Button></DialogFooter>
          </>
        )}
        {!done && csr && (
          <SignForm
            mount={mount}
            csr={csr}
            keyFilename={`${fileStem(form.commonName, 'intermediate')}.key.pem`}
            sign={sign}
            onChange={(patch) => setSign((current) => ({ ...current, ...patch }))}
            showErrors={showErrors}
            pending={pending}
            failure={failure}
            onSubmit={submitSign}
            onCancel={() => void close()}
            onKeySaved={guard.markSaved}
          />
        )}
        {!done && !csr && (
          <form onSubmit={submitForm} noValidate>
            <div className="space-y-4 p-4">
              <p className="text-xs leading-5 text-foreground-600">
                Vault creates a key and a signing request. A parent CA then signs the request, and the signed
                certificate is installed here as an issuer.
              </p>
              <CaSubjectFields kind="intermediate" form={form} errors={showErrors ? formErrors : {}} onChange={(patch) => setForm((current) => ({ ...current, ...patch }))} />
              {failure && <ErrorNotice title="The signing request was not created" error={failure} permissionHint={`Your token needs update on ${mount}/intermediate/generate.`} />}
            </div>
            <DialogFooter>
              <Button type="button" size="sm" onClick={() => void close()} disabled={pending}>Cancel</Button>
              <Button type="submit" size="sm" variant="primary" loading={pending}>Create signing request</Button>
            </DialogFooter>
          </form>
        )}
      </Modal>
      {guard.dialog}
    </>
  );
}
