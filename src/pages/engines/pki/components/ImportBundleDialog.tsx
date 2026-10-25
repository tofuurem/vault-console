import { useState, type FormEvent } from 'react';

import { useImportIssuerBundle } from '@/application/engines/pki/usePkiMutations';
import Button from '@/components/base/Button';
import { Textarea } from '@/components/base/Input';
import Modal from '@/components/base/Modal';
import type { PkiImportResult } from '@/domain/engines/pki/pki';
import { certificatePems, containsPrivateKey, tryParseCertificate } from '@/domain/engines/pki/x509';
import { DialogFooter } from './FormControls';
import { ErrorNotice, WarningList } from './Notices';

function bundleError(bundle: string): string | undefined {
  if (!bundle.trim()) return 'Paste at least one PEM certificate.';
  const certificates = certificatePems(bundle);
  if (certificates.length === 0) return 'No PEM certificate was found.';
  if (certificates.some((pem) => !tryParseCertificate(pem))) return 'One of the certificates could not be read.';
  return undefined;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? '' : 's'}`;
}

/** Imports existing CA certificates, optionally with their keys, as issuers. */
export default function ImportBundleDialog({ mount, open, onClose }: {
  readonly mount: string;
  readonly open: boolean;
  readonly onClose: () => void;
}) {
  const [bundle, setBundle] = useState('');
  const [showErrors, setShowErrors] = useState(false);
  const [result, setResult] = useState<PkiImportResult>();
  const mutation = useImportIssuerBundle(mount);
  const error = bundleError(bundle);
  const certificates = error ? [] : certificatePems(bundle);
  const hasKey = containsPrivateKey(bundle);

  const close = () => {
    if (mutation.isPending) return;
    setBundle('');
    setShowErrors(false);
    setResult(undefined);
    mutation.reset();
    onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (error) return;
    mutation.mutate(bundle, {
      onSuccess: (imported) => {
        setResult(imported);
        // Drop the pasted bundle (it may include a key) as soon as Vault has it.
        setBundle('');
        mutation.reset();
      },
    });
  };

  return (
    <Modal open={open} onClose={close} title="Import a CA" width="lg">
      {result ? (
        <>
          <div className="space-y-3 p-4">
            <p role="status" className="rounded-md border border-success-200 bg-success-50 px-3 py-2 text-xs leading-5 text-success-800">
              Imported {plural(result.importedIssuers.length, 'issuer')} and {plural(result.importedKeys.length, 'key')}.
              {result.existingIssuers.length > 0 && ` ${plural(result.existingIssuers.length, 'issuer')} already existed.`}
            </p>
            <WarningList warnings={result.warnings} />
          </div>
          <DialogFooter><Button size="sm" variant="primary" onClick={close}>Done</Button></DialogFooter>
        </>
      ) : (
        <form onSubmit={submit} noValidate>
          <div className="space-y-3 p-4">
            <p className="text-xs leading-5 text-foreground-600">
              Paste CA certificates in PEM format. Add the matching private key to let this mount issue
              certificates with it; without a key the issuer is only used to complete chains.
            </p>
            <Textarea
              label="PEM bundle"
              value={bundle}
              onChange={(event) => setBundle(event.target.value)}
              rows={10}
              spellCheck={false}
              autoComplete="off"
              placeholder="-----BEGIN CERTIFICATE-----"
              error={showErrors ? error : undefined}
              monospace
            />
            {certificates.length > 0 && (
              <ul className="space-y-0.5 text-xs text-foreground-700" aria-label="Certificates in the bundle">
                {certificates.map((pem) => {
                  const parsed = tryParseCertificate(pem);
                  return (
                    <li key={pem} className="flex items-center gap-1.5">
                      <i className={parsed?.isCa ? 'ri-shield-keyhole-line text-primary-600' : 'ri-file-shield-2-line text-warning-600'} aria-hidden="true" />
                      <span className="truncate">{parsed?.subject.commonName ?? parsed?.subject.text}</span>
                      {!parsed?.isCa && <span className="text-warning-700">(not a CA; Vault will refuse it)</span>}
                    </li>
                  );
                })}
              </ul>
            )}
            {hasKey && (
              <p className="flex gap-1.5 rounded-md border border-background-300 bg-background-100 px-3 py-2 text-xs leading-5 text-foreground-700">
                <i className="ri-key-2-line mt-0.5 shrink-0" aria-hidden="true" />
                The bundle includes a private key. It is sent straight to Vault and cleared from this form after import.
              </p>
            )}
            {mutation.isError && <ErrorNotice title="Nothing was imported" error={mutation.error} permissionHint={`Your token needs update on ${mount}/issuers/import/bundle.`} />}
          </div>
          <DialogFooter>
            <Button type="button" size="sm" onClick={close} disabled={mutation.isPending}>Cancel</Button>
            <Button type="submit" size="sm" variant="primary" loading={mutation.isPending}>Import</Button>
          </DialogFooter>
        </form>
      )}
    </Modal>
  );
}
