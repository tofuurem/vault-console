import { useId, type ReactNode, type SelectHTMLAttributes } from 'react';

import { SELECT_CLASS } from '../pki-format';

interface SelectFieldProps extends SelectHTMLAttributes<HTMLSelectElement> {
  readonly label: string;
  readonly hint?: string;
  readonly options: readonly { readonly value: string; readonly label: string }[];
}

export function SelectField({ label, hint, options, id, ...props }: SelectFieldProps) {
  const generated = useId();
  const selectId = id ?? generated;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={selectId} className="text-xs font-medium text-foreground-700">{label}</label>
      <select id={selectId} className={SELECT_CLASS} aria-describedby={hint ? `${selectId}-hint` : undefined} {...props}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>{option.label}</option>
        ))}
      </select>
      {hint && <span id={`${selectId}-hint`} className="text-[11px] leading-4 text-foreground-500">{hint}</span>}
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
  const id = useId();
  return (
    <div className="flex min-h-11 items-start gap-2 py-1 sm:min-h-0">
      <input
        id={id}
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
        aria-describedby={description ? `${id}-description` : undefined}
        className="mt-0.5 h-4 w-4 shrink-0 cursor-pointer rounded border-background-400 accent-primary-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:cursor-not-allowed"
      />
      <span className="min-w-0">
        <label htmlFor={id} className="cursor-pointer text-xs font-medium text-foreground-800">{label}</label>
        {description && (
          <span id={`${id}-description`} className="block text-[11px] leading-4 text-foreground-500">{description}</span>
        )}
      </span>
    </div>
  );
}

interface ChoiceOption<T extends string> {
  readonly value: T;
  readonly label: string;
  readonly description: string;
  readonly icon?: string;
}

/** Card-style radio group, as used by the engine picker. */
export function ChoiceCards<T extends string>({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly ChoiceOption<T>[];
  readonly value: T;
  readonly onChange: (value: T) => void;
}) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-xs font-medium text-foreground-700">{label}</legend>
      <div role="radiogroup" aria-label={label} className="grid gap-1.5 sm:grid-cols-2">
        {options.map((option) => {
          const active = option.value === value;
          return (
            <button
              key={option.value}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => onChange(option.value)}
              className={`flex min-h-11 items-start gap-2.5 rounded-md border p-2.5 text-left transition-[border-color,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
                active
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-background-300 bg-background-50 hover:border-background-400 hover:bg-background-100'
              }`}
            >
              {option.icon && (
                <i className={`${option.icon} mt-0.5 text-base ${active ? 'text-primary-600' : 'text-foreground-500'}`} aria-hidden="true" />
              )}
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-foreground-900">{option.label}</span>
                <span className="mt-0.5 block text-[11px] leading-4 text-foreground-600">{option.description}</span>
              </span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FormSection({ title, description, children }: { readonly title: string; readonly description?: string; readonly children: ReactNode }) {
  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-xs font-semibold text-foreground-900">{title}</h4>
        {description && <p className="mt-0.5 text-[11px] leading-4 text-foreground-500">{description}</p>}
      </div>
      {children}
    </section>
  );
}

export function DialogFooter({ children }: { readonly children: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-end gap-2 border-t border-background-200 px-4 py-3">{children}</div>
  );
}
