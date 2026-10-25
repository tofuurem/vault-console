import { useState, type FormEvent } from 'react';

import { useDeleteTransitKey, useUpdateTransitKeyConfig } from '@/application/engines/transit/useTransitKeys';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import type { TransitKey, TransitKeyConfigInput } from '@/domain/engines/transit/transit';
import {
  autoRotatePeriodError,
  autoRotatePeriodInput,
  keyVersionLimitsError,
} from '@/domain/engines/transit/transit-validation';
import { CheckboxField, OperationError, SelectField } from './fields';

function currentConfig(key: TransitKey): TransitKeyConfigInput {
  return {
    minDecryptionVersion: key.minDecryptionVersion,
    minEncryptionVersion: key.minEncryptionVersion,
    deletionAllowed: key.deletionAllowed,
    exportable: key.exportable,
    allowPlaintextBackup: key.allowPlaintextBackup,
    autoRotatePeriod: autoRotatePeriodInput(key.autoRotatePeriodSeconds),
  };
}

function versionOptions(from: number, to: number): readonly (readonly [string, string])[] {
  return Array.from({ length: Math.max(0, to - from + 1) }, (_, index) => {
    const version = to - index;
    return [String(version), `v${version}`] as const;
  });
}

function ConfigForm({ mount, transitKey }: { readonly mount: string; readonly transitKey: TransitKey }) {
  const toast = useToast();
  const mutation = useUpdateTransitKeyConfig(mount, transitKey.name);
  const initial = currentConfig(transitKey);
  const [config, setConfig] = useState(initial);
  const signing = transitKey.supportsSigning && !transitKey.supportsEncryption;
  const limitsError = keyVersionLimitsError(transitKey, config);
  const rotateError = autoRotatePeriodError(config.autoRotatePeriod);
  const dirty = (Object.keys(initial) as (keyof TransitKeyConfigInput)[]).some((field) => initial[field] !== config[field]);
  const update = (patch: Partial<TransitKeyConfigInput>) => {
    setConfig((current) => ({ ...current, ...patch }));
    mutation.reset();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (limitsError || rotateError || !dirty) return;
    mutation.mutate(config, { onSuccess: () => toast.success(`Saved settings for ${transitKey.name}.`) });
  };
  const floor = Math.max(1, transitKey.minAvailableVersion);

  return (
    <form onSubmit={submit} className="space-y-4 rounded-lg border border-background-300 bg-background-50 p-3 sm:p-4" aria-labelledby="transit-config-title">
      <div>
        <h3 id="transit-config-title" className="text-sm font-semibold text-foreground-900">Key settings</h3>
        <p className="mt-0.5 text-xs leading-5 text-foreground-600">
          Raising a minimum version archives older versions. Lower it again to restore them, unless they were trimmed.
        </p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <SelectField
          label={signing ? 'Minimum verification version' : 'Minimum decryption version'}
          value={String(config.minDecryptionVersion)}
          onChange={(value) => update({ minDecryptionVersion: Number(value) })}
          options={versionOptions(floor, transitKey.latestVersion)}
          hint={signing ? 'Signatures from older versions fail to verify.' : 'Ciphertext from older versions cannot be decrypted.'}
        />
        <SelectField
          label={signing ? 'Minimum signing version' : 'Minimum encryption version'}
          value={String(config.minEncryptionVersion)}
          onChange={(value) => update({ minEncryptionVersion: Number(value) })}
          options={[['0', 'Latest version'], ...versionOptions(floor, transitKey.latestVersion)]}
          hint="Callers can pin a key version at or above this one."
        />
      </div>
      {limitsError && <p role="alert" className="text-xs text-danger-600">{limitsError}</p>}
      <Input
        label="Automatic rotation period"
        value={config.autoRotatePeriod}
        onChange={(event) => update({ autoRotatePeriod: event.target.value })}
        placeholder="Off"
        hint="For example 720h. Leave empty or 0 to turn it off; at least 1h."
        error={rotateError}
        spellCheck={false}
        monospace
      />
      <div className="space-y-1 border-t border-background-200 pt-3">
        <CheckboxField
          label="Allow deletion"
          description="Vault refuses to delete a key until this is on."
          checked={config.deletionAllowed}
          onChange={(deletionAllowed) => update({ deletionAllowed })}
        />
        <CheckboxField
          label="Exportable"
          description={transitKey.exportable ? 'This key is exportable. Vault does not allow turning that off.' : 'Allows reading the key material out of Vault. This cannot be turned off later.'}
          checked={config.exportable}
          disabled={transitKey.exportable}
          onChange={(exportable) => update({ exportable })}
        />
        <CheckboxField
          label="Allow plaintext backup"
          description={transitKey.allowPlaintextBackup ? 'Plaintext backups are allowed. Vault does not allow turning that off.' : 'Allows backing up the key without encryption. This cannot be turned off later.'}
          checked={config.allowPlaintextBackup}
          disabled={transitKey.allowPlaintextBackup}
          onChange={(allowPlaintextBackup) => update({ allowPlaintextBackup })}
        />
      </div>
      <OperationError error={mutation.error} action="change this key's settings" />
      <div className="flex justify-end gap-2">
        <Button type="button" size="sm" disabled={!dirty || mutation.isPending} onClick={() => setConfig(initial)}>Reset</Button>
        <Button type="submit" size="sm" variant="primary" disabled={!dirty || Boolean(limitsError || rotateError)} loading={mutation.isPending}>
          Save settings
        </Button>
      </div>
    </form>
  );
}

function DeleteSection({ mount, transitKey, onDeleted }: {
  readonly mount: string;
  readonly transitKey: TransitKey;
  readonly onDeleted: () => void;
}) {
  const toast = useToast();
  const [typed, setTyped] = useState('');
  const remove = useDeleteTransitKey(mount, transitKey.name);
  const allow = useUpdateTransitKeyConfig(mount, transitKey.name);
  const confirmed = typed.trim() === transitKey.name;
  return (
    <section aria-labelledby="transit-delete-title" className="space-y-3 rounded-lg border border-danger-200 bg-danger-50/40 p-3">
      <div>
        <h4 id="transit-delete-title" className="text-xs font-semibold text-danger-700">Delete key</h4>
        <p className="mt-1 text-xs leading-5 text-foreground-600">
          Deleting removes every version of <span className="font-mono">{transitKey.name}</span>. Anything encrypted with it
          can never be decrypted again. This cannot be undone.
        </p>
      </div>
      {transitKey.deletionAllowed ? (
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            if (!confirmed) return;
            remove.mutate(undefined, {
              onSuccess: () => {
                toast.success(`Deleted ${transitKey.name}.`);
                onDeleted();
              },
            });
          }}
        >
          <Input
            label={`Type ${transitKey.name} to confirm`}
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            autoComplete="off"
            spellCheck={false}
            monospace
          />
          <OperationError error={remove.error} action="delete this key" />
          <Button type="submit" size="sm" variant="danger" disabled={!confirmed} loading={remove.isPending}>
            Delete {transitKey.name}
          </Button>
        </form>
      ) : (
        <div className="space-y-2">
          <p className="text-xs leading-5 text-foreground-600">
            Vault protects this key from deletion. Allow deletion first; you can still change your mind before deleting.
          </p>
          <OperationError error={allow.error} action="allow deletion of this key" />
          <Button
            type="button"
            size="sm"
            loading={allow.isPending}
            onClick={() => allow.mutate({ ...currentConfig(transitKey), deletionAllowed: true })}
          >
            Allow deletion
          </Button>
        </div>
      )}
    </section>
  );
}

export default function TransitKeySettings({ mount, transitKey, onDeleted }: {
  readonly mount: string;
  readonly transitKey: TransitKey;
  readonly onDeleted: () => void;
}) {
  // Remount the form when Vault reports new values so it never edits stale settings.
  const revision = JSON.stringify(currentConfig(transitKey)) + transitKey.latestVersion;
  return (
    <div className="space-y-4">
      <ConfigForm key={revision} mount={mount} transitKey={transitKey} />
      <DeleteSection mount={mount} transitKey={transitKey} onDeleted={onDeleted} />
    </div>
  );
}
