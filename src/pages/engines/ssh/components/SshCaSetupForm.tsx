import { useState, type FormEvent } from 'react';

import { useConfigureSshCa } from '@/application/engines/ssh/useSsh';
import { useToast } from '@/application/notifications/ToastContext';
import Button from '@/components/base/Button';
import { Textarea } from '@/components/base/Input';
import { SSH_CA_KEY_TYPES, sshPrivateKey, type SshCaKeyType } from '@/domain/engines/ssh/ssh';
import { sshPublicKeyError } from '@/domain/engines/ssh/ssh-keys';
import { ErrorNotice, Segmented, Select } from './ssh-ui';

type Mode = 'generate' | 'import';

const PRIVATE_KEY = /^-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]+-----END [A-Z ]*PRIVATE KEY-----$/;

function privateKeyError(value: string): string | undefined {
  if (!value.trim()) return 'Paste the CA private key.';
  if (/ENCRYPTED/.test(value) || /Proc-Type: 4,ENCRYPTED/.test(value)) return 'Vault needs an unencrypted private key. Remove the passphrase first.';
  return PRIVATE_KEY.test(value.trim()) ? undefined : 'Paste a PEM or OpenSSH private key, including the BEGIN and END lines.';
}

/** Generates a CA inside Vault (recommended) or imports an existing key pair. */
export default function SshCaSetupForm({ mount, onConfigured }: { readonly mount: string; readonly onConfigured?: () => void }) {
  const toast = useToast();
  const mutation = useConfigureSshCa(mount);
  const [mode, setMode] = useState<Mode>('generate');
  const [keyType, setKeyType] = useState<SshCaKeyType>('ssh-ed25519');
  const [keyBits, setKeyBits] = useState(4096);
  const [privateKey, setPrivateKey] = useState('');
  const [publicKey, setPublicKey] = useState('');
  const [showErrors, setShowErrors] = useState(false);

  const bits = SSH_CA_KEY_TYPES.find((entry) => entry.value === keyType)?.bits ?? [];
  const privateError = mode === 'import' ? privateKeyError(privateKey) : undefined;
  const publicError = mode === 'import' ? sshPublicKeyError(publicKey) : undefined;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (privateError || publicError) return;
    const input = mode === 'generate'
      ? { mode, keyType, ...(bits.length > 0 ? { keyBits } : {}) } as const
      : { mode, privateKey: sshPrivateKey(privateKey.trim()), publicKey } as const;
    mutation.mutate(input, {
      onSuccess: () => {
        // The private key leaves component state as soon as Vault has it.
        setPrivateKey('');
        setPublicKey('');
        setShowErrors(false);
        toast.success(mode === 'generate' ? 'Vault generated a new signing CA.' : 'The CA key pair was imported.');
        onConfigured?.();
      },
    });
  };

  return (
    <form onSubmit={submit} className="space-y-4" aria-label="Configure signing CA">
      <Segmented<Mode>
        label="Key source"
        value={mode}
        onChange={(next) => {
          setMode(next);
          setShowErrors(false);
          mutation.reset();
        }}
        options={[{ value: 'generate', label: 'Generate in Vault' }, { value: 'import', label: 'Import key pair' }]}
      />
      {mode === 'generate' ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Select label="Key type" value={keyType} onChange={(event) => setKeyType(event.target.value as SshCaKeyType)}>
            {SSH_CA_KEY_TYPES.map((entry) => <option key={entry.value} value={entry.value}>{entry.label}</option>)}
          </Select>
          {bits.length > 0 && (
            <Select label="Key size" value={keyBits} onChange={(event) => setKeyBits(Number(event.target.value))}>
              {bits.map((size) => <option key={size} value={size}>{size} bits</option>)}
            </Select>
          )}
          <p className="text-[11px] leading-4 text-foreground-500 sm:col-span-2">
            The private key is created inside Vault and never leaves it. Ed25519 works with OpenSSH 6.5 and later; pick RSA for older hosts.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <Textarea
            label="CA private key"
            value={privateKey}
            onChange={(event) => setPrivateKey(event.target.value)}
            rows={6}
            spellCheck={false}
            autoComplete="off"
            placeholder="-----BEGIN OPENSSH PRIVATE KEY-----"
            error={showErrors ? privateError : undefined}
            monospace
          />
          <Textarea
            label="CA public key"
            value={publicKey}
            onChange={(event) => setPublicKey(event.target.value)}
            rows={2}
            spellCheck={false}
            placeholder="ssh-ed25519 AAAA…"
            error={showErrors ? publicError : undefined}
            monospace
          />
          <p className="text-[11px] leading-4 text-foreground-500">
            The private key is sent to Vault once and cleared from this page. Vault never returns it.
          </p>
        </div>
      )}
      {mutation.isError && (
        <ErrorNotice
          title="The signing CA was not configured"
          error={mutation.error}
          permissionHint={`Your token needs update on ${mount}/config/ca.`}
          requestHint="If a CA already exists, delete it first. Imported keys must be an unencrypted matching pair."
        />
      )}
      <div className="flex justify-end">
        <Button type="submit" size="sm" variant="primary" loading={mutation.isPending}>
          {mode === 'generate' ? 'Generate signing CA' : 'Import key pair'}
        </Button>
      </div>
    </form>
  );
}
