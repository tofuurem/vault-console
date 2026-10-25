import { useState, type FormEvent } from 'react';

import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { Input } from '@/components/base/Input';
import { transitErrorText } from '@/domain/engines/transit/transit';
import { transitKeyNameError } from '@/domain/engines/transit/transit-validation';
import { normalizeVaultError } from '@/domain/vault/errors';

const FILTER_THRESHOLD = 8;

interface TransitKeyListProps {
  readonly keys: readonly string[] | undefined;
  readonly pending: boolean;
  readonly error: unknown;
  readonly selected?: string;
  readonly onSelect: (name: string) => void;
  readonly onCreate: () => void;
}

/** Without LIST permission an operator may still be allowed to use a key they know by name. */
function OpenByName({ onOpen }: { readonly onOpen: (name: string) => void }) {
  const [name, setName] = useState('');
  const [showError, setShowError] = useState(false);
  const error = showError ? transitKeyNameError(name) : undefined;
  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowError(true);
    if (!transitKeyNameError(name)) onOpen(name.trim());
  };
  return (
    <form onSubmit={submit} className="space-y-2" noValidate>
      <Input label="Open a key by name" value={name} onChange={(event) => setName(event.target.value)} error={error} spellCheck={false} autoComplete="off" monospace />
      <Button type="submit" size="sm">Open key</Button>
    </form>
  );
}

export default function TransitKeyList({ keys, pending, error, selected, onSelect, onCreate }: TransitKeyListProps) {
  const [filter, setFilter] = useState('');
  if (pending) return <ContentSkeleton variant="list" label="Loading keys" />;
  if (error) {
    const text = transitErrorText(normalizeVaultError(error), 'list keys on this mount');
    return (
      <div className="space-y-3 rounded-lg border border-background-300 bg-background-50 p-3">
        <p role="alert" className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-xs leading-5 text-warning-900">{text.message}</p>
        <OpenByName onOpen={onSelect} />
      </div>
    );
  }
  const all = keys ?? [];
  if (all.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-background-300 bg-background-50 p-4 text-center">
        <i className="ri-key-2-line text-xl text-foreground-400" aria-hidden="true" />
        <p className="mt-1 text-xs font-medium text-foreground-800">No keys yet</p>
        <p className="mt-0.5 text-xs leading-5 text-foreground-500">Create a key to start encrypting, signing, or computing HMACs.</p>
        <Button type="button" size="sm" variant="primary" className="mt-3" onClick={onCreate}>
          <i className="ri-add-line" aria-hidden="true" />
          Create key
        </Button>
      </div>
    );
  }
  const needle = filter.trim().toLowerCase();
  const visible = needle ? all.filter((name) => name.toLowerCase().includes(needle)) : all;
  return (
    <div className="space-y-2">
      {all.length > FILTER_THRESHOLD && (
        <Input
          aria-label="Filter keys"
          placeholder="Filter keys"
          icon="ri-search-line"
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          spellCheck={false}
        />
      )}
      <ul aria-label="Transit keys" className="divide-y divide-background-200 overflow-hidden rounded-lg border border-background-300 bg-background-50">
        {visible.map((name) => {
          const active = name === selected;
          return (
            <li key={name}>
              <button
                type="button"
                aria-current={active ? 'true' : undefined}
                onClick={() => onSelect(name)}
                className={`flex min-h-11 w-full items-center gap-2 px-3 text-left font-mono text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:min-h-9 ${
                  active ? 'bg-primary-50 text-primary-800' : 'text-foreground-800 hover:bg-background-100'
                }`}
              >
                <i className={`ri-key-2-line text-sm ${active ? 'text-primary-600' : 'text-foreground-400'}`} aria-hidden="true" />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <i className="ri-arrow-right-s-line text-foreground-400" aria-hidden="true" />
              </button>
            </li>
          );
        })}
        {visible.length === 0 && <li className="px-3 py-2 text-xs text-foreground-500">No keys match this filter.</li>}
      </ul>
    </div>
  );
}
