import type { ReactNode, SelectHTMLAttributes } from 'react';

import Button from '@/components/base/Button';
import { normalizeVaultError } from '@/domain/vault/errors';
import type { CopyState } from './useCopy';

export const SELECT_CLASS = 'h-11 w-full rounded-md border border-background-300 bg-background-50 px-2.5 text-sm text-foreground-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 sm:text-xs';
export const CHECKBOX_CLASS = 'h-4 w-4 shrink-0 rounded border-background-300 text-primary-600 focus-visible:ring-2 focus-visible:ring-primary-400';

export function CopyButton({ id, value, label, copy }: {
  readonly id: string;
  readonly value: string;
  readonly label: string;
  readonly copy: CopyState;
}) {
  const done = copy.copied === id;
  return (
    <Button size="sm" variant="ghost" onClick={() => void copy.copy(id, value)} aria-label={done ? `${label} copied` : `Copy ${label}`}>
      <i className={done ? 'ri-check-line text-success-600' : 'ri-file-copy-line'} aria-hidden="true" />
      <span className="hidden sm:inline">{done ? 'Copied' : 'Copy'}</span>
    </Button>
  );
}

/** A monospace block with a copy action, for keys and shell snippets. */
export function CodeBlock({ id, label, value, copy, actions, wrap = true }: {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly copy: CopyState;
  readonly actions?: ReactNode;
  readonly wrap?: boolean;
}) {
  // `w-0 min-w-full` keeps long unwrapped lines from widening the page; the block scrolls instead.
  return (
    <div className="w-0 min-w-full overflow-hidden rounded-md border border-background-300 bg-background-100">
      <div className="flex items-center justify-between gap-2 border-b border-background-200 py-1 pl-3 pr-1">
        <span className="truncate text-[11px] font-medium text-foreground-600">{label}</span>
        <div className="flex shrink-0 items-center gap-0.5">
          {actions}
          <CopyButton id={id} value={value} label={label} copy={copy} />
        </div>
      </div>
      <pre className={`max-h-56 overflow-auto px-3 py-2 font-mono text-[11px] leading-5 text-foreground-800 ${wrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre'}`}>
        <code>{value}</code>
      </pre>
    </div>
  );
}

export function Panel({ title, description, actions, children, labelledBy }: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly labelledBy: string;
}) {
  return (
    <section aria-labelledby={labelledBy} className="overflow-hidden rounded-lg border border-background-300 bg-background-50">
      <header className="flex flex-wrap items-start justify-between gap-2 border-b border-background-200 px-3 py-2.5 sm:px-4">
        <div className="min-w-0">
          <h2 id={labelledBy} className="text-xs font-semibold text-foreground-900">{title}</h2>
          {description && <p className="mt-0.5 text-xs leading-5 text-foreground-600">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
      </header>
      <div className="space-y-3 p-3 sm:p-4">{children}</div>
    </section>
  );
}

export function Notice({ tone = 'info', title, children }: {
  readonly tone?: 'info' | 'warning' | 'success';
  readonly title?: string;
  readonly children: ReactNode;
}) {
  const tones = {
    info: ['border-background-300 bg-background-100 text-foreground-700', 'ri-information-line text-foreground-500'],
    warning: ['border-warning-200 bg-warning-50 text-warning-900', 'ri-error-warning-line'],
    success: ['border-success-200 bg-success-50 text-success-800', 'ri-checkbox-circle-line'],
  } as const;
  const [box, icon] = tones[tone];
  return (
    <div className={`flex gap-2 rounded-md border px-3 py-2 text-xs leading-5 ${box}`}>
      <i className={`${icon} mt-0.5 shrink-0`} aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div>{children}</div>
      </div>
    </div>
  );
}

/** Vault errors in plain words; a 403 names the policy capability that is missing. */
export function ErrorNotice({ title, error, permissionHint, requestHint }: {
  readonly title: string;
  readonly error: unknown;
  /** Shown for 403, e.g. "Your token needs read on ssh/config/ca." */
  readonly permissionHint?: string;
  /** Shown for 400, when Vault refused the request itself. */
  readonly requestHint?: string;
}) {
  const vaultError = normalizeVaultError(error);
  const hint = vaultError.code === 'authorization' ? permissionHint : vaultError.code === 'invalid-request' ? requestHint : undefined;
  return (
    <div role="alert" className="rounded-md border border-danger-200 bg-danger-50 px-3 py-2 text-xs leading-5 text-danger-800">
      <p className="font-semibold">{title}</p>
      <p>{vaultError.message}{hint ? ` ${hint}` : ''}</p>
      {vaultError.reason && vaultError.code !== 'authorization' && (
        <p className="mt-1 break-words">Vault reported: {vaultError.reason}</p>
      )}
    </div>
  );
}

export function EmptyState({ icon, title, children, action }: {
  readonly icon: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-background-300 bg-background-50 px-4 py-8 text-center">
      <i className={`${icon} text-2xl text-foreground-400`} aria-hidden="true" />
      <h2 className="mt-2 text-sm font-semibold text-foreground-900">{title}</h2>
      <div className="mt-1 max-w-md text-xs leading-5 text-foreground-600">{children}</div>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function Select({ label, hint, children, ...props }: SelectHTMLAttributes<HTMLSelectElement> & {
  readonly label: string;
  readonly hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs font-medium text-foreground-700">
      {label}
      <select className={SELECT_CLASS} {...props}>{children}</select>
      {hint && <span className="text-[11px] font-normal leading-4 text-foreground-500">{hint}</span>}
    </label>
  );
}

export function Checkbox({ label, description, checked, onChange, disabled }: {
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
  readonly disabled?: boolean;
}) {
  return (
    <label className={`flex min-h-11 items-start gap-2 py-1.5 text-xs text-foreground-800 sm:min-h-8 ${disabled ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        className={`${CHECKBOX_CLASS} mt-0.5`}
      />
      <span className="min-w-0">
        <span className="font-medium">{label}</span>
        {description && <span className="mt-0.5 block text-[11px] leading-4 text-foreground-500">{description}</span>}
      </span>
    </label>
  );
}

/** Segmented single choice, e.g. user or host certificate. */
export function Segmented<T extends string>({ label, value, options, onChange }: {
  readonly label: string;
  readonly value: T;
  readonly options: readonly { readonly value: T; readonly label: string; readonly disabled?: boolean }[];
  readonly onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-foreground-700">{label}</span>
      <div role="radiogroup" aria-label={label} className="inline-flex w-fit rounded-md border border-background-300 bg-background-50 p-0.5">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={value === option.value}
            disabled={option.disabled}
            onClick={() => onChange(option.value)}
            className={`min-h-10 rounded px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:cursor-not-allowed disabled:opacity-40 sm:min-h-7 ${
              value === option.value ? 'bg-primary-100 text-primary-700' : 'text-foreground-600 hover:text-foreground-900'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}
