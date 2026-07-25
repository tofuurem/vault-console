export type ExplorerSearchScope = 'folder' | 'mount';

interface ExplorerSearchProps {
  readonly query: string;
  readonly scope: ExplorerSearchScope;
  readonly onQueryChange: (query: string) => void;
  readonly onScopeChange: (scope: ExplorerSearchScope) => void;
}

export default function ExplorerSearch({
  query,
  scope,
  onQueryChange,
  onScopeChange,
}: ExplorerSearchProps) {
  return (
    <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center">
      <label className="relative min-w-0 flex-1">
        <span className="sr-only">Search secret paths</span>
        <i
          className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-sm text-foreground-400"
          aria-hidden="true"
        />
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder={scope === 'folder' ? 'Search this folder' : 'Search paths in this mount'}
          autoComplete="off"
          spellCheck={false}
          className="h-8 w-full rounded-md border border-background-300 bg-background-50 pl-8 pr-3 text-xs text-foreground-900 placeholder:text-foreground-400 focus:border-primary-400 focus:outline-none focus:ring-2 focus:ring-primary-200"
        />
      </label>
      <div
        role="radiogroup"
        aria-label="Search scope"
        className="grid shrink-0 grid-cols-2 rounded-md border border-background-300 bg-background-100 p-0.5"
      >
        {([
          ['folder', 'This folder'],
          ['mount', 'Entire mount'],
        ] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={scope === value}
            onClick={() => onScopeChange(value)}
            className={`h-7 rounded px-2.5 text-[10px] font-semibold transition-colors ${
              scope === value
                ? 'bg-background-50 text-foreground-800 shadow-sm'
                : 'text-foreground-500 hover:text-foreground-800'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
