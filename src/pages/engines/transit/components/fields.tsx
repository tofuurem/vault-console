import { useId, useState, type ReactNode } from 'react';

import Button from '@/components/base/Button';
import { Textarea } from '@/components/base/Input';
import { transitErrorText, type TransitKey } from '@/domain/engines/transit/transit';
import { usableKeyVersions } from '@/domain/engines/transit/transit-validation';
import { normalizeVaultError } from '@/domain/vault/errors';
import type { PayloadInputState } from './usePayloadInput';
import { useCopyToClipboard } from './useCopyToClipboard';

export const SELECT_CLASS = 'h-11 w-full rounded-md border border-background-300 bg-background-50 px-2.5 text-xs text-foreground-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8';

interface SelectFieldProps {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly options: readonly (readonly [value: string, label: string])[];
  readonly hint?: string;
  readonly disabled?: boolean;
}

export function SelectField({ label, value, onChange, options, hint, disabled }: SelectFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground-700">{label}</label>
      <select
        id={id}
        value={value}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={SELECT_CLASS}
      >
        {options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}
      </select>
      {hint && <span id={`${id}-hint`} className="text-[11px] leading-4 text-foreground-500">{hint}</span>}
    </div>
  );
}

interface CheckboxFieldProps {
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
}

export function CheckboxField({ label, description, checked, onChange, disabled }: CheckboxFieldProps) {
  return (
    <label className={`flex min-h-11 items-start gap-2 rounded-md py-1.5 text-xs text-foreground-700 sm:min-h-8 ${disabled ? 'cursor-not-allowed opacity-60' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-background-300 text-primary-600 focus-visible:ring-2 focus-visible:ring-primary-400"
      />
      <span>
        <span className="font-medium text-foreground-800">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] leading-4 text-foreground-500">{description}</span>}
      </span>
    </label>
  );
}

interface PayloadFieldProps {
  readonly label: string;
  readonly payload: PayloadInputState;
  readonly placeholder?: string;
  readonly rows?: number;
  readonly showErrors: boolean;
  readonly hint?: string;
}

/** Text area whose content is base64-encoded for Vault unless the operator says it already is. */
export function PayloadField({ label, payload, placeholder, rows = 4, showErrors, hint }: PayloadFieldProps) {
  const error = showErrors && !payload.encoded.ok ? payload.encoded.message : undefined;
  return (
    <div className="space-y-1">
      <Textarea
        label={label}
        value={payload.text}
        onChange={(event) => payload.setText(event.target.value)}
        rows={rows}
        placeholder={placeholder}
        spellCheck={false}
        autoComplete="off"
        error={error}
        monospace
        className="text-xs"
      />
      <div className="flex flex-wrap items-center justify-between gap-x-3">
        <CheckboxField label="Input is already base64" checked={payload.base64} onChange={payload.setBase64} />
        {hint && <span className="text-[11px] leading-4 text-foreground-500">{hint}</span>}
      </div>
    </div>
  );
}

interface ContextFieldProps {
  readonly payload: PayloadInputState;
  readonly showErrors: boolean;
  readonly purpose: string;
}

/** Derived keys need the same context for every operation on the same data. */
export function ContextField({ payload, showErrors, purpose }: ContextFieldProps) {
  const missing = showErrors && payload.text.trim() === '';
  const id = useId();
  const invalid = showErrors && !payload.encoded.ok ? payload.encoded.message : undefined;
  const error = missing ? 'This key is derived, so a context is required.' : invalid;
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="text-xs font-medium text-foreground-700">Context</label>
      <input
        id={id}
        value={payload.text}
        onChange={(event) => payload.setText(event.target.value)}
        spellCheck={false}
        autoComplete="off"
        aria-invalid={Boolean(error)}
        aria-describedby={`${id}-hint`}
        placeholder="tenant-42"
        className={`h-11 w-full rounded-md border bg-background-50 px-2.5 font-mono text-xs text-foreground-900 placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30 sm:h-8 ${error ? 'border-danger-400' : 'border-background-300'}`}
      />
      {error && <span className="block text-xs text-danger-600">{error}</span>}
      <span id={`${id}-hint`} className="block text-[11px] leading-4 text-foreground-500">
        This key derives a separate key per context. Use the same context to {purpose}.
      </span>
      <CheckboxField label="Context is already base64" checked={payload.base64} onChange={payload.setBase64} />
    </div>
  );
}

interface KeyVersionFieldProps {
  readonly transitKey: TransitKey;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly label?: string;
}

/** "Latest" or a specific version the key still allows for new data. */
export function KeyVersionField({ transitKey, value, onChange, label = 'Key version' }: KeyVersionFieldProps) {
  const versions = usableKeyVersions(transitKey);
  if (versions.length <= 1) return null;
  return (
    <SelectField
      label={label}
      value={value}
      onChange={onChange}
      options={[
        ['', `Latest (v${transitKey.latestVersion})`],
        ...versions.filter((version) => version !== transitKey.latestVersion).map((version) => [String(version), `v${version}`] as const),
      ]}
    />
  );
}

export function OperationError({ error, action }: { readonly error: unknown; readonly action: string }) {
  if (!error) return null;
  const text = transitErrorText(normalizeVaultError(error), action);
  return (
    <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-800">
      <p className="font-medium">{text.message}</p>
      {text.detail && <p className="mt-0.5 text-danger-700">{text.detail}</p>}
    </div>
  );
}

interface ResultPanelProps {
  readonly title: string;
  readonly onClear: () => void;
  readonly children: ReactNode;
  readonly note?: string;
}

/** Holds one operation result in memory only; Clear drops it. */
export function ResultPanel({ title, onClear, children, note }: ResultPanelProps) {
  return (
    <section aria-label={title} className="overflow-hidden rounded-lg border border-background-300 bg-background-50">
      <header className="flex items-center justify-between gap-2 border-b border-background-200 bg-background-100/60 px-3 py-1.5">
        <h4 className="text-xs font-semibold text-foreground-900">{title}</h4>
        <Button type="button" size="sm" variant="ghost" onClick={onClear}>
          <i className="ri-close-line" aria-hidden="true" />
          Clear
        </Button>
      </header>
      <div className="space-y-3 p-3">
        {children}
        {note && <p className="text-[11px] leading-4 text-foreground-500">{note}</p>}
      </div>
    </section>
  );
}

interface SecretOutputProps {
  readonly label: string;
  readonly value: string;
  /** Hide until revealed; for plaintext and key material. */
  readonly masked?: boolean;
  readonly meta?: string;
}

/** Read-only output with copy and, for secrets, reveal. */
export function SecretOutput({ label, value, masked = false, meta }: SecretOutputProps) {
  const [revealed, setRevealed] = useState(!masked);
  const { copied, copy } = useCopyToClipboard();
  const id = useId();
  return (
    <div className="space-y-1">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-foreground-700">
          <span id={id}>{label}</span>
          {meta && <span className="ml-1.5 font-normal tabular-nums text-foreground-500">{meta}</span>}
        </span>
        <div className="flex items-center gap-1">
          {masked && (
            <Button type="button" size="sm" variant="ghost" aria-pressed={revealed} onClick={() => setRevealed((current) => !current)} aria-label={`${revealed ? 'Hide' : 'Reveal'} ${label.toLowerCase()}`}>
              <i className={revealed ? 'ri-eye-off-line' : 'ri-eye-line'} aria-hidden="true" />
              {revealed ? 'Hide' : 'Reveal'}
            </Button>
          )}
          <Button type="button" size="sm" variant="ghost" onClick={() => void copy('value', value)} aria-label={`Copy ${label.toLowerCase()}`}>
            <i className={copied ? 'ri-check-line text-success-600' : 'ri-file-copy-line'} aria-hidden="true" />
            {copied ? 'Copied' : 'Copy'}
          </Button>
        </div>
      </div>
      <output
        aria-labelledby={id}
        className={`block max-h-60 overflow-y-auto whitespace-pre-wrap break-all rounded-md border border-background-200 bg-background-100 px-2.5 py-2 font-mono text-xs ${
          revealed ? 'text-foreground-900' : 'select-none tracking-[0.12em] text-foreground-400'
        }`}
      >
        {revealed ? (value || <span className="font-sans text-foreground-500">(empty)</span>) : '••••••••••••'}
      </output>
    </div>
  );
}

/** Large, unambiguous valid/invalid verdict. */
export function VerificationResult({ valid, subject }: { readonly valid: boolean; readonly subject: string }) {
  return (
    <div
      role="status"
      className={`flex items-start gap-2.5 rounded-md border px-3 py-2.5 ${
        valid ? 'border-success-200 bg-success-50 text-success-800' : 'border-danger-200 bg-danger-50 text-danger-800'
      }`}
    >
      <i className={`${valid ? 'ri-checkbox-circle-fill text-success-600' : 'ri-close-circle-fill text-danger-600'} text-lg leading-none`} aria-hidden="true" />
      <div className="text-xs leading-5">
        <p className="text-sm font-semibold">{valid ? `Valid ${subject}` : `Invalid ${subject}`}</p>
        <p>
          {valid
            ? `The ${subject} matches this input and key.`
            : `The ${subject} does not match this input and key. The input, ${subject}, or options differ from what was used to create it.`}
        </p>
      </div>
    </div>
  );
}

export function SubmitRow({ label, pending, icon }: { readonly label: string; readonly pending: boolean; readonly icon: string }) {
  return (
    <div className="flex justify-end">
      <Button type="submit" size="sm" variant="primary" loading={pending}>
        {!pending && <i className={icon} aria-hidden="true" />}
        {label}
      </Button>
    </div>
  );
}
