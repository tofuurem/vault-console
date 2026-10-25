import { Input } from '@/components/base/Input';
import { PKI_DEFAULT_KEY_BITS, PKI_KEY_BITS, type PkiKeyType } from '@/domain/engines/pki/pki';
import type { CaFormErrors, CaFormState } from '../ca-form';
import { ChoiceCards, FormSection, SelectField } from './FormControls';

const KEY_TYPES: readonly { readonly value: PkiKeyType; readonly label: string }[] = [
  { value: 'ec', label: 'EC (ECDSA)' },
  { value: 'rsa', label: 'RSA' },
  { value: 'ed25519', label: 'Ed25519' },
];

export function KeyFields({ keyType, keyBits, onChange }: {
  readonly keyType: PkiKeyType;
  readonly keyBits: number;
  readonly onChange: (keyType: PkiKeyType, keyBits: number) => void;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <SelectField
        label="Key type"
        value={keyType}
        options={KEY_TYPES}
        onChange={(event) => {
          const next = event.target.value as PkiKeyType;
          onChange(next, PKI_DEFAULT_KEY_BITS[next]);
        }}
      />
      <SelectField
        label="Key size"
        value={String(keyBits)}
        disabled={keyType === 'ed25519'}
        options={PKI_KEY_BITS[keyType].map((bits) => ({
          value: String(bits),
          label: bits === 0 ? 'Fixed (256-bit)' : keyType === 'ec' ? `P-${bits}` : `${bits} bits`,
        }))}
        onChange={(event) => onChange(keyType, Number(event.target.value))}
      />
    </div>
  );
}

/** Key handling, subject, names, and key fields shared by root and intermediate CA forms. */
export default function CaSubjectFields({ kind, form, errors, onChange }: {
  readonly kind: 'root' | 'intermediate';
  readonly form: CaFormState;
  readonly errors: CaFormErrors;
  readonly onChange: (patch: Partial<CaFormState>) => void;
}) {
  const text = (field: keyof CaFormState) => ({
    value: String(form[field]),
    onChange: (event: { readonly target: { readonly value: string } }) => onChange({ [field]: event.target.value }),
    error: errors[field],
  });
  return (
    <div className="space-y-5">
      <ChoiceCards
        label="Private key"
        value={form.exportKey}
        onChange={(exportKey) => onChange({ exportKey })}
        options={[
          { value: 'internal', label: 'Keep in Vault', description: 'Recommended. The key never leaves Vault.', icon: 'ri-shield-check-line' },
          { value: 'exported', label: 'Export once', description: 'Vault also returns the key to you a single time, for offline backup.', icon: 'ri-key-2-line' },
        ]}
      />
      <FormSection title="Identity">
        <Input label="Common name" {...text('commonName')} placeholder={kind === 'root' ? 'Example Root CA' : 'Example Intermediate CA'} autoComplete="off" />
        <div className="grid gap-3 sm:grid-cols-2">
          {kind === 'root' && (
            <Input label="Issuer name" {...text('issuerName')} hint="Optional. A readable reference such as root-2026." spellCheck={false} monospace />
          )}
          <Input label="Key name" {...text('keyName')} hint="Optional name for the new key." spellCheck={false} monospace />
        </div>
      </FormSection>
      <FormSection title="Key">
        <KeyFields keyType={form.keyType} keyBits={form.keyBits} onChange={(keyType, keyBits) => onChange({ keyType, keyBits })} />
      </FormSection>
      {kind === 'root' && (
        <FormSection title="Validity">
          <div className="grid gap-3 sm:grid-cols-2">
            <Input label="Lifetime (TTL)" {...text('ttl')} hint="Cannot exceed the mount's max lease TTL." spellCheck={false} monospace />
            <Input label="Max path length" {...text('maxPathLength')} hint="How many intermediate levels may follow. Empty means no limit." inputMode="numeric" />
          </div>
        </FormSection>
      )}
      <details className="group rounded-md border border-background-300">
        <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-3 text-xs font-medium text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:min-h-9">
          <i className="ri-arrow-right-s-line transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
          Organization and alternative names
          <span className="font-normal text-foreground-500">· optional</span>
        </summary>
        <div className="grid gap-3 border-t border-background-200 p-3 sm:grid-cols-2">
          <Input label="Organization" {...text('organization')} />
          <Input label="Organizational unit" {...text('ou')} />
          <Input label="Country" {...text('country')} placeholder="US" maxLength={2} />
          <Input label="Province or state" {...text('province')} />
          <Input label="Locality" {...text('locality')} />
          <Input label="DNS names or emails" {...text('altNames')} hint="Comma-separated." spellCheck={false} monospace />
          <Input label="IP addresses" {...text('ipSans')} hint="Comma-separated." spellCheck={false} monospace />
        </div>
      </details>
    </div>
  );
}
