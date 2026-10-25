import { useId, useState, type FormEvent } from 'react';

import { useCreateTransitKey } from '@/application/engines/transit/useTransitKeys';
import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import Modal from '@/components/base/Modal';
import {
  DEFAULT_TRANSIT_KEY_TYPE,
  TRANSIT_KEY_TYPES,
  transitKeyTypeInfo,
  type TransitKeyTypeInfo,
} from '@/domain/engines/transit/transit-key-types';
import {
  autoRotatePeriodError,
  HMAC_KEY_SIZE,
  hmacKeySizeError,
  transitKeyNameError,
} from '@/domain/engines/transit/transit-validation';
import { CheckboxField, OperationError, SELECT_CLASS } from './fields';

const GROUPS: readonly (readonly [string, (entry: TransitKeyTypeInfo) => boolean])[] = [
  ['Encryption', (entry) => entry.family === 'symmetric'],
  ['Signing', (entry) => entry.family === 'ed25519' || entry.family === 'ecdsa'],
  ['Encryption and signing', (entry) => entry.family === 'rsa'],
  ['HMAC', (entry) => entry.family === 'hmac'],
];

function capabilities(info: TransitKeyTypeInfo): string {
  if (info.family === 'hmac') return 'HMAC';
  const parts = [
    info.encryption ? 'encrypt, decrypt, data keys' : undefined,
    info.signing ? 'sign, verify' : undefined,
    'HMAC',
  ].filter(Boolean);
  return parts.join(' · ');
}

interface CreateTransitKeyDialogProps {
  readonly mount: string;
  readonly open: boolean;
  readonly existing: readonly string[];
  readonly onClose: () => void;
  readonly onCreated: (name: string) => void;
}

interface KeyForm {
  readonly name: string;
  readonly type: string;
  readonly derived: boolean;
  readonly convergentEncryption: boolean;
  readonly exportable: boolean;
  readonly allowPlaintextBackup: boolean;
  readonly autoRotatePeriod: string;
  readonly keySize: string;
}

const EMPTY_FORM: KeyForm = {
  name: '',
  type: DEFAULT_TRANSIT_KEY_TYPE,
  derived: false,
  convergentEncryption: false,
  exportable: false,
  allowPlaintextBackup: false,
  autoRotatePeriod: '',
  keySize: String(HMAC_KEY_SIZE.default),
};

function KeyTypeSelect({ value, onChange }: { readonly value: string; readonly onChange: (type: string) => void }) {
  const id = useId();
  const info = transitKeyTypeInfo(value);
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground-700">Key type</label>
      <select id={id} value={value} onChange={(event) => onChange(event.target.value)} aria-describedby={`${id}-hint`} className={SELECT_CLASS}>
        {GROUPS.map(([group, matches]) => (
          <optgroup key={group} label={group}>
            {TRANSIT_KEY_TYPES.filter(matches).map((entry) => <option key={entry.type} value={entry.type}>{entry.label}</option>)}
          </optgroup>
        ))}
      </select>
      {info && (
        <span id={`${id}-hint`} className="text-[11px] leading-4 text-foreground-500">
          {info.description} Supports {capabilities(info)}.
        </span>
      )}
    </div>
  );
}

export default function CreateTransitKeyDialog({ mount, open, existing, onClose, onCreated }: CreateTransitKeyDialogProps) {
  const mutation = useCreateTransitKey(mount);
  const [form, setForm] = useState(EMPTY_FORM);
  const [showErrors, setShowErrors] = useState(false);
  const info = transitKeyTypeInfo(form.type);
  const nameError = transitKeyNameError(form.name, existing);
  const rotateError = autoRotatePeriodError(form.autoRotatePeriod);
  const sizeError = form.type === 'hmac' ? hmacKeySizeError(form.keySize) : undefined;

  const update = (patch: Partial<KeyForm>) => {
    setForm((current) => ({ ...current, ...patch }));
    mutation.reset();
  };
  const selectType = (type: string) => {
    const next = transitKeyTypeInfo(type);
    update({
      type,
      derived: next?.derivation ? form.derived : false,
      convergentEncryption: next?.convergent ? form.convergentEncryption : false,
    });
  };
  const close = () => {
    if (mutation.isPending) return;
    setForm(EMPTY_FORM);
    setShowErrors(false);
    mutation.reset();
    onClose();
  };
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (nameError || rotateError || sizeError) return;
    const name = form.name.trim();
    mutation.mutate({
      name,
      type: form.type,
      derived: form.derived,
      convergentEncryption: form.derived && form.convergentEncryption,
      exportable: form.exportable,
      allowPlaintextBackup: form.allowPlaintextBackup,
      autoRotatePeriod: form.autoRotatePeriod,
      keySize: form.type === 'hmac' ? Number(form.keySize) : undefined,
    }, {
      onSuccess: () => {
        setForm(EMPTY_FORM);
        setShowErrors(false);
        onCreated(name);
      },
    });
  };

  return (
    <Modal open={open} onClose={close} title="Create transit key" width="lg">
      <form onSubmit={submit} noValidate>
        <div className="space-y-4 p-4">
          <Input
            label="Key name"
            value={form.name}
            onChange={(event) => update({ name: event.target.value })}
            error={showErrors ? nameError : undefined}
            hint={`Applications call /v1/${mount}/encrypt/<name> and similar paths.`}
            spellCheck={false}
            autoComplete="off"
            monospace
          />
          <KeyTypeSelect value={form.type} onChange={selectType} />
          {form.type === 'hmac' && (
            <Input
              label="Key size in bytes"
              value={form.keySize}
              onChange={(event) => update({ keySize: event.target.value })}
              error={showErrors ? sizeError : undefined}
              inputMode="numeric"
              hint={`From ${HMAC_KEY_SIZE.min} to ${HMAC_KEY_SIZE.max} bytes.`}
            />
          )}
          <Input
            label="Automatic rotation period"
            value={form.autoRotatePeriod}
            onChange={(event) => update({ autoRotatePeriod: event.target.value })}
            placeholder="Off"
            error={showErrors ? rotateError : undefined}
            hint="For example 720h. Leave empty to rotate only by hand; at least 1h."
            spellCheck={false}
            monospace
          />
          <fieldset className="space-y-1 rounded-md border border-background-200 px-3 py-2">
            <legend className="px-1 text-xs font-medium text-foreground-700">Options</legend>
            {info?.derivation && (
              <CheckboxField
                label="Derive a key per context"
                description="Every request must include a context, and each context gets its own key. Cannot be changed later."
                checked={form.derived}
                onChange={(derived) => update({ derived, convergentEncryption: derived && form.convergentEncryption })}
              />
            )}
            {info?.convergent && (
              <CheckboxField
                label="Convergent encryption"
                description="The same plaintext and context always produce the same ciphertext, which makes values searchable but reveals repeats. Requires per-context keys."
                checked={form.convergentEncryption}
                disabled={!form.derived}
                onChange={(convergentEncryption) => update({ convergentEncryption })}
              />
            )}
            <CheckboxField
              label="Exportable"
              description="Allows reading the key material out of Vault. This cannot be turned off later."
              checked={form.exportable}
              onChange={(exportable) => update({ exportable })}
            />
            <CheckboxField
              label="Allow plaintext backup"
              description="Allows backing up the key without encryption. This cannot be turned off later."
              checked={form.allowPlaintextBackup}
              onChange={(allowPlaintextBackup) => update({ allowPlaintextBackup })}
            />
          </fieldset>
          <OperationError error={mutation.error} action="create this key" />
        </div>
        <div className="flex items-center justify-end gap-2 border-t border-background-200 px-4 py-3">
          <Button type="button" size="sm" onClick={close} disabled={mutation.isPending}>Cancel</Button>
          <Button type="submit" size="sm" variant="primary" loading={mutation.isPending}>Create key</Button>
        </div>
      </form>
    </Modal>
  );
}
