import { useEffect, useState } from 'react';

import Button from '@/components/base/Button';
import Drawer from '@/components/base/Drawer';
import { Input } from '@/components/base/Input';
import type {
  KvV2SecretHistory,
} from '@/domain/vault/contracts';
import type { KvV2SecretMetadataInput } from '@/domain/vault/kv-v2';
import { normalizeVaultError } from '@/domain/vault/errors';
import {
  parseSecretMetadataForm,
  type CustomMetadataField,
} from '@/domain/vault/secret-metadata-form';

interface EditableMetadataField extends CustomMetadataField {
  readonly id: number;
}

interface SecretMetadataDrawerProps {
  readonly open: boolean;
  readonly mount: string;
  readonly path: string | null;
  readonly onClose: () => void;
  readonly onLoad: (
    mount: string,
    path: string,
    signal: AbortSignal,
  ) => Promise<KvV2SecretHistory>;
  readonly onSave: (
    mount: string,
    path: string,
    input: KvV2SecretMetadataInput,
  ) => Promise<void>;
}

let nextFieldId = 0;

function fieldsFrom(metadata: KvV2SecretHistory): EditableMetadataField[] {
  const fields = Object.entries(metadata.customMetadata).map(([key, value]) => ({
    id: ++nextFieldId,
    key,
    value,
  }));
  return fields.length > 0
    ? fields
    : [{ id: ++nextFieldId, key: '', value: '' }];
}

export default function SecretMetadataDrawer({
  open,
  mount,
  path,
  onClose,
  onLoad,
  onSave,
}: SecretMetadataDrawerProps) {
  const [status, setStatus] = useState<'loading' | 'ready' | 'error'>('loading');
  const [maxVersions, setMaxVersions] = useState('0');
  const [casRequired, setCasRequired] = useState(false);
  const [deleteVersionAfter, setDeleteVersionAfter] = useState('0s');
  const [fields, setFields] = useState<EditableMetadataField[]>([]);
  const [loadError, setLoadError] = useState('');
  const [validationErrors, setValidationErrors] = useState<readonly string[]>([]);
  const [saveError, setSaveError] = useState('');
  const [saving, setSaving] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    if (!open || !path) return;
    const controller = new AbortController();
    setStatus('loading');
    setLoadError('');
    setValidationErrors([]);
    setSaveError('');
    setSaving(false);
    void onLoad(mount, path, controller.signal).then((metadata) => {
      if (controller.signal.aborted) return;
      setMaxVersions(String(metadata.maxVersions));
      setCasRequired(metadata.casRequired);
      setDeleteVersionAfter(metadata.deleteVersionAfter);
      setFields(fieldsFrom(metadata));
      setStatus('ready');
    }).catch((cause: unknown) => {
      if (controller.signal.aborted) return;
      setLoadError(normalizeVaultError(cause).message);
      setStatus('error');
    });
    return () => controller.abort();
  }, [loadAttempt, mount, onLoad, open, path]);

  if (!path) return null;

  const updateField = (id: number, key: 'key' | 'value', value: string) => {
    setFields((current) => current.map((field) => (
      field.id === id ? { ...field, [key]: value } : field
    )));
  };
  const save = async () => {
    const parsed = parseSecretMetadataForm({
      maxVersions,
      casRequired,
      deleteVersionAfter,
      customMetadata: fields,
    });
    if (parsed.ok === false) {
      setValidationErrors(parsed.errors);
      return;
    }
    setValidationErrors([]);
    setSaveError('');
    setSaving(true);
    try {
      await onSave(mount, path, parsed.data);
      setSaving(false);
      onClose();
    } catch (cause) {
      setSaveError(normalizeVaultError(cause).message);
      setSaving(false);
    }
  };
  const requestClose = () => {
    if (!saving) onClose();
  };

  return (
    <Drawer open={open} onClose={requestClose} title="Edit key metadata" width="560px">
      <div className="space-y-4 p-4">
        <div className="rounded-md border border-background-200 bg-background-100 px-3 py-2 text-xs">
          <span className="text-foreground-500">Target </span>
          <span className="break-all font-mono text-foreground-800">{mount}/{path}</span>
        </div>

        {status === 'loading' && (
          <div role="status" className="space-y-2" aria-label="Loading current key metadata">
            <div className="h-12 animate-pulse rounded-md bg-background-100" />
            <div className="h-24 animate-pulse rounded-md bg-background-100" />
            <p className="text-xs text-foreground-500">Reading the latest metadata from Vault…</p>
          </div>
        )}

        {status === 'error' && (
          <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 p-3 text-xs text-danger-700">
            <p className="font-semibold">Current metadata could not be loaded</p>
            <p className="mt-1">{loadError}</p>
            <button
              type="button"
              onClick={() => setLoadAttempt((attempt) => attempt + 1)}
              className="mt-2 font-semibold underline underline-offset-2"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'ready' && (
          <>
            <p className="rounded-md border border-success-200 bg-success-50 px-3 py-2 text-[11px] text-success-700">
              Loaded fresh from Vault. Saving replaces the complete supported metadata document.
            </p>

            {(validationErrors.length > 0 || saveError) && (
              <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs text-danger-700">
                {validationErrors.map((error) => <p key={error}>{error}</p>)}
                {saveError && <p>{saveError}</p>}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Input
                label="Maximum versions"
                value={maxVersions}
                onChange={(event) => setMaxVersions(event.target.value)}
                inputMode="numeric"
                min="0"
              />
              <Input
                label="Delete version after"
                value={deleteVersionAfter}
                onChange={(event) => setDeleteVersionAfter(event.target.value)}
                placeholder="0s"
                monospace
              />
            </div>
            <label className="flex cursor-pointer items-start gap-2 rounded-md border border-background-200 p-3 text-xs text-foreground-700">
              <input
                type="checkbox"
                checked={casRequired}
                onChange={(event) => setCasRequired(event.target.checked)}
              />
              <span><strong>Require check-and-set</strong><span className="mt-0.5 block text-[11px] text-foreground-500">All writes to this key must include a CAS version.</span></span>
            </label>

            <section aria-labelledby="custom-metadata-heading">
              <div className="mb-2 flex items-center justify-between">
                <h4 id="custom-metadata-heading" className="text-xs font-semibold text-foreground-700">Custom metadata</h4>
                <button
                  type="button"
                  onClick={() => setFields((current) => [
                    ...current,
                    { id: ++nextFieldId, key: '', value: '' },
                  ])}
                  className="text-xs text-primary-600 hover:text-primary-700"
                >
                  + Add field
                </button>
              </div>
              <div className="space-y-1.5">
                {fields.map((field) => (
                  <div key={field.id} className="grid grid-cols-[1fr_1fr_32px] gap-2">
                    <input
                      aria-label="Custom metadata key"
                      value={field.key}
                      onChange={(event) => updateField(field.id, 'key', event.target.value)}
                      placeholder="owner"
                      className="h-11 rounded-md border border-background-300 bg-background-50 px-2 font-mono text-xs focus:border-primary-400 focus:outline-none sm:h-8"
                    />
                    <input
                      aria-label={`Custom metadata value for ${field.key || 'new key'}`}
                      value={field.value}
                      onChange={(event) => updateField(field.id, 'value', event.target.value)}
                      placeholder="platform"
                      className="h-11 rounded-md border border-background-300 bg-background-50 px-2 text-xs focus:border-primary-400 focus:outline-none sm:h-8"
                    />
                    <button
                      type="button"
                      aria-label={`Remove custom metadata ${field.key || 'field'}`}
                      disabled={fields.length === 1}
                      onClick={() => setFields((current) => current.filter((candidate) => candidate.id !== field.id))}
                      className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-400 hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-400 disabled:opacity-30 sm:h-8 sm:w-8"
                    >
                      <i className="ri-close-line" aria-hidden="true" />
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <div className="flex justify-end gap-2">
              <Button size="sm" onClick={requestClose} disabled={saving}>Cancel</Button>
              <Button size="sm" variant="primary" loading={saving} onClick={() => void save()}>
                Save key metadata
              </Button>
            </div>
          </>
        )}
      </div>
    </Drawer>
  );
}
