import { useState } from 'react';

import { generateSecurePassword } from '@/domain/access-control/password';
import { emptySecretField, type SecretField } from '@/domain/vault/secret-fields';

interface SecretFieldsEditorProps {
  readonly fields: readonly SecretField[];
  readonly onChange: (fields: readonly SecretField[]) => void;
  readonly disabled?: boolean;
}

const INPUT = 'h-11 w-full min-w-0 rounded-md border border-background-300 bg-background-50 px-2 font-mono text-xs text-foreground-900 placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30 disabled:opacity-50 sm:h-8';
const ICON_BUTTON = 'flex h-9 w-9 items-center justify-center rounded text-foreground-500 hover:bg-background-100 hover:text-foreground-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-40 sm:h-6 sm:w-6';

/**
 * Flat key/value editing shared by secret creation and editing. Values are
 * masked by default; each row can be revealed or filled with a generated
 * password without the value ever leaving the input.
 */
export default function SecretFieldsEditor({ fields, onChange, disabled = false }: SecretFieldsEditorProps) {
  const [revealed, setRevealed] = useState<ReadonlySet<number>>(() => new Set());
  const update = (id: number, change: Partial<Pick<SecretField, 'key' | 'value'>>) => {
    onChange(fields.map((field) => field.id === id ? { ...field, ...change } : field));
  };
  const toggleReveal = (id: number) => setRevealed((current) => {
    const next = new Set(current);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  });

  return (
    <div className="space-y-1.5">
      {fields.map((field) => {
        const visible = revealed.has(field.id);
        const label = field.key || 'new key';
        return (
          <div key={field.id} className="grid min-w-0 grid-cols-[minmax(0,1fr)_44px] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_32px]">
            <input
              aria-label="Secret key"
              value={field.key}
              onChange={(event) => update(field.id, { key: event.target.value })}
              placeholder="KEY"
              autoComplete="off"
              spellCheck={false}
              disabled={disabled}
              className={`${INPUT} col-span-2 sm:col-span-1`}
            />
            <div className="relative min-w-0">
              <input
                aria-label={`Value for ${label}`}
                type={visible ? 'text' : 'password'}
                value={field.value}
                onChange={(event) => update(field.id, { value: event.target.value })}
                placeholder="value"
                autoComplete="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                data-bwignore="true"
                disabled={disabled}
                className={`${INPUT} pr-20 sm:pr-14`}
              />
              <div className="absolute inset-y-0 right-1 flex items-center gap-0.5">
                <button
                  type="button"
                  aria-label={`Generate password for ${label}`}
                  title="Generate a strong password"
                  disabled={disabled}
                  onClick={() => update(field.id, { value: generateSecurePassword(32) })}
                  className={ICON_BUTTON}
                >
                  <i className="ri-magic-line text-xs" aria-hidden="true" />
                </button>
                <button
                  type="button"
                  aria-label={visible ? `Hide value for ${label}` : `Show value for ${label}`}
                  aria-pressed={visible}
                  disabled={disabled}
                  onClick={() => toggleReveal(field.id)}
                  className={ICON_BUTTON}
                >
                  <i className={`${visible ? 'ri-eye-off-line' : 'ri-eye-line'} text-xs`} aria-hidden="true" />
                </button>
              </div>
            </div>
            <button
              type="button"
              aria-label="Remove field"
              disabled={disabled || fields.length === 1}
              onClick={() => onChange(fields.filter((candidate) => candidate.id !== field.id))}
              className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-500 hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-400 disabled:opacity-30 sm:h-8 sm:w-8"
            >
              <i className="ri-close-line" aria-hidden="true" />
            </button>
          </div>
        );
      })}
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange([...fields, emptySecretField()])}
        className="inline-flex min-h-11 items-center gap-1 rounded px-1 text-xs font-medium text-primary-700 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50 sm:min-h-7"
      >
        <i className="ri-add-line" aria-hidden="true" />
        Add field
      </button>
    </div>
  );
}
