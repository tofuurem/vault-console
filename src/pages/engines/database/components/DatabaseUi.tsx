import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

type NoticeTone = 'danger' | 'warning' | 'info';

const NOTICE_TONES: Record<NoticeTone, string> = {
  danger: 'border-danger-200 bg-danger-50 text-danger-800',
  warning: 'border-warning-200 bg-warning-50 text-warning-900',
  info: 'border-background-300 bg-background-100 text-foreground-700',
};

const NOTICE_ICONS: Record<NoticeTone, string> = {
  danger: 'ri-error-warning-line',
  warning: 'ri-alert-line',
  info: 'ri-information-line',
};

export function Notice({
  tone = 'info',
  title,
  children,
  alert = tone === 'danger',
}: {
  readonly tone?: NoticeTone;
  readonly title?: string;
  readonly children: ReactNode;
  readonly alert?: boolean;
}) {
  return (
    <div role={alert ? 'alert' : undefined} className={`flex gap-2 rounded-md border px-3 py-2 text-xs leading-5 ${NOTICE_TONES[tone]}`}>
      <i className={`${NOTICE_ICONS[tone]} mt-0.5 shrink-0`} aria-hidden="true" />
      <div className="min-w-0">
        {title && <p className="font-semibold">{title}</p>}
        <div className="break-words">{children}</div>
      </div>
    </div>
  );
}

export function EmptyState({
  icon,
  title,
  children,
  action,
}: {
  readonly icon: string;
  readonly title: string;
  readonly children: ReactNode;
  readonly action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center rounded-lg border border-dashed border-background-300 bg-background-50 px-4 py-10 text-center">
      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-background-100 text-foreground-500">
        <i className={`${icon} text-lg`} aria-hidden="true" />
      </div>
      <h2 className="mt-3 text-sm font-semibold text-foreground-900">{title}</h2>
      <div className="mt-1 max-w-md text-xs leading-5 text-foreground-600">{children}</div>
      {action && <div className="mt-4 flex flex-wrap justify-center gap-2">{action}</div>}
    </div>
  );
}

export function DetailHeader({
  icon,
  title,
  subtitle,
  actions,
  titleId,
}: {
  readonly icon: string;
  readonly title: string;
  readonly subtitle?: ReactNode;
  readonly actions?: ReactNode;
  readonly titleId?: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="flex min-w-0 items-center gap-2.5">
        <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-background-100 text-foreground-600">
          <i className={`${icon} text-sm`} aria-hidden="true" />
        </div>
        <div className="min-w-0">
          <h2 id={titleId} className="truncate font-mono text-sm font-semibold text-foreground-900">{title}</h2>
          {subtitle && <p className="mt-0.5 truncate text-xs text-foreground-500">{subtitle}</p>}
        </div>
      </div>
      {actions && <div className="flex flex-wrap items-center gap-1.5">{actions}</div>}
    </div>
  );
}

export interface DetailItem {
  readonly label: string;
  readonly value: ReactNode;
  readonly mono?: boolean;
}

export function DetailList({ items }: { readonly items: readonly DetailItem[] }) {
  return (
    <dl className="grid gap-x-6 gap-y-2.5 rounded-lg border border-background-300 bg-background-50 p-3 text-xs sm:grid-cols-[minmax(120px,auto)_1fr]">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-foreground-500">{item.label}</dt>
          <dd className={`-mt-2 break-all text-foreground-900 sm:mt-0 ${item.mono ? 'font-mono' : ''}`}>{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatementBlock({
  label,
  statements,
  fallback = 'Plugin default',
}: {
  readonly label: string;
  readonly statements: readonly string[];
  readonly fallback?: string;
}) {
  return (
    <section aria-label={label} className="space-y-1">
      <h3 className="text-xs font-medium text-foreground-700">{label}</h3>
      {statements.length > 0 ? (
        <pre className="max-h-64 overflow-auto whitespace-pre-wrap break-words rounded-md border border-background-300 bg-background-100 p-2.5 font-mono text-[11px] leading-5 text-foreground-800">
          {statements.join('\n')}
        </pre>
      ) : (
        <p className="text-xs text-foreground-500">{fallback}</p>
      )}
    </section>
  );
}

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label: string;
  readonly error?: string;
  readonly hint?: string;
  readonly children: ReactNode;
}

/** Native select styled like `Input`, so mobile users get the platform picker. */
export function SelectField({ label, error, hint, children, id, className = '', ...props }: SelectFieldProps) {
  const generatedId = useId();
  const selectId = id ?? generatedId;
  const describedBy = [error ? `${selectId}-error` : undefined, hint ? `${selectId}-hint` : undefined]
    .filter(Boolean)
    .join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-xs font-medium text-foreground-700">{label}</label>
      <select
        id={selectId}
        aria-invalid={Boolean(error)}
        aria-describedby={describedBy}
        className={`h-11 w-full rounded-md border bg-background-50 px-2 text-sm text-foreground-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30 disabled:cursor-not-allowed disabled:opacity-50 sm:h-8 ${
          error ? 'border-danger-400' : 'border-background-300'
        } ${className}`}
        {...props}
      >
        {children}
      </select>
      {error && <span id={`${selectId}-error`} className="text-xs text-danger-600">{error}</span>}
      {hint && <span id={`${selectId}-hint`} className="text-[11px] leading-4 text-foreground-500">{hint}</span>}
    </div>
  );
}

export function CheckboxField({
  label,
  description,
  checked,
  onChange,
}: {
  readonly label: string;
  readonly description?: string;
  readonly checked: boolean;
  readonly onChange: (checked: boolean) => void;
}) {
  const id = useId();
  return (
    <div className="flex min-h-11 items-start gap-2.5 sm:min-h-0">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={description ? `${id}-description` : undefined}
        className="mt-0.5 h-4 w-4 shrink-0 rounded border-background-300 text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
      />
      <div>
        <label htmlFor={id} className="text-xs font-medium text-foreground-800">{label}</label>
        {description && <p id={`${id}-description`} className="text-[11px] leading-4 text-foreground-500">{description}</p>}
      </div>
    </div>
  );
}

/** Collapsible group for optional settings, matching the Enable engine dialog. */
export function OptionalSection({ title, children, defaultOpen = false }: {
  readonly title: string;
  readonly children: ReactNode;
  readonly defaultOpen?: boolean;
}) {
  return (
    <details className="group rounded-md border border-background-300" open={defaultOpen}>
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-1.5 px-3 text-xs font-medium text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:min-h-9">
        <i className="ri-arrow-right-s-line transition-transform group-open:rotate-90 motion-reduce:transition-none" aria-hidden="true" />
        {title}
        <span className="font-normal text-foreground-500">· optional</span>
      </summary>
      <div className="space-y-3 border-t border-background-200 p-3">{children}</div>
    </details>
  );
}

export function FormCard({ title, description, children }: {
  readonly title: string;
  readonly description?: ReactNode;
  readonly children: ReactNode;
}) {
  return (
    <section aria-label={title} className="rounded-lg border border-background-300 bg-background-50">
      <header className="border-b border-background-200 px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground-900">{title}</h2>
        {description && <p className="mt-0.5 text-xs leading-5 text-foreground-600">{description}</p>}
      </header>
      {children}
    </section>
  );
}

/** Inline link to a connection's detail. */
export function ConnectionLink({ name, onOpen }: { readonly name: string; readonly onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="inline-flex min-h-11 items-center gap-1 rounded font-mono text-primary-700 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-0"
    >
      <i className="ri-plug-line" aria-hidden="true" />
      {name}
    </button>
  );
}
