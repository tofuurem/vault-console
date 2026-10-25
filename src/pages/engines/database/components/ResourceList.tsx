import { useState, type ReactNode } from 'react';

import ContentSkeleton from '@/components/base/ContentSkeleton';
import { Input } from '@/components/base/Input';
import { Notice } from './DatabaseUi';

interface ResourceListProps {
  readonly title: string;
  readonly icon: string;
  readonly names: readonly string[] | undefined;
  readonly selected?: string;
  readonly loading: boolean;
  readonly error?: string;
  readonly onSelect: (name: string) => void;
  /** Shown when the list loaded and is empty. */
  readonly empty: ReactNode;
}

const FILTER_THRESHOLD = 8;

/** Left-hand list of a section; selection mirrors the URL. */
export default function ResourceList({ title, icon, names, selected, loading, error, onSelect, empty }: ResourceListProps) {
  const [filter, setFilter] = useState('');
  const visible = (names ?? []).filter((name) => name.toLowerCase().includes(filter.trim().toLowerCase()));
  return (
    <section aria-label={title} className="overflow-hidden rounded-lg border border-background-300 bg-background-50">
      <header className="flex min-h-10 items-center justify-between gap-2 border-b border-background-200 px-3 py-2">
        <h2 className="text-xs font-semibold text-foreground-900">{title}</h2>
        {names && <span className="text-[11px] tabular-nums text-foreground-500">{names.length}</span>}
      </header>
      {loading && <ContentSkeleton variant="list" label={`Loading ${title.toLowerCase()}`} />}
      {error && <div className="p-3"><Notice tone="warning" alert>{error}</Notice></div>}
      {names && names.length === 0 && <div className="p-3">{empty}</div>}
      {names && names.length > FILTER_THRESHOLD && (
        <div className="border-b border-background-200 p-2">
          <Input
            aria-label={`Filter ${title.toLowerCase()}`}
            placeholder="Filter"
            icon="ri-search-line"
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            spellCheck={false}
          />
        </div>
      )}
      {visible.length > 0 && (
        <ul className="max-h-[60vh] divide-y divide-background-200 overflow-y-auto">
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
                  <i className={`${icon} text-sm ${active ? 'text-primary-600' : 'text-foreground-500'}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1 truncate">{name}</span>
                  <i className="ri-arrow-right-s-line text-foreground-400 lg:hidden" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {names && names.length > 0 && visible.length === 0 && (
        <p className="px-3 py-3 text-xs text-foreground-500">Nothing matches this filter.</p>
      )}
    </section>
  );
}
