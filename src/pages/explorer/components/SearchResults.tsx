import type {
  KvSearchMountState,
} from '@/application/vault/search/KvSearchContext';
import type { RankedKvPathMatch } from '@/application/vault/search/search-ranking';
import type { KvPathEntry } from '@/domain/vault/search';
import type { ExplorerSearchScope } from './ExplorerSearch';

interface SearchResultsProps {
  readonly query: string;
  readonly scope: ExplorerSearchScope;
  readonly matches: readonly RankedKvPathMatch[];
  readonly indexState: KvSearchMountState;
  readonly onOpen: (entry: KvPathEntry) => void;
  readonly onCancel: () => void;
  readonly onContinue: () => void;
  readonly onRetry: () => void;
}

const MAX_RENDERED_RESULTS = 200;

function HighlightedText({ value, query }: { readonly value: string; readonly query: string }) {
  const normalizedValue = value.toLocaleLowerCase();
  const normalizedQuery = query.trim().toLocaleLowerCase();
  const index = normalizedValue.indexOf(normalizedQuery);
  if (!normalizedQuery || index < 0) return value;
  return (
    <>
      {value.slice(0, index)}
      <mark className="rounded-sm bg-warning-100 px-0.5 text-inherit">
        {value.slice(index, index + normalizedQuery.length)}
      </mark>
      {value.slice(index + normalizedQuery.length)}
    </>
  );
}

function coverageText(state: KvSearchMountState): string {
  if (state.status === 'scanning') {
    return `Scanning · ${state.totalScannedPrefixes} folders · ${state.entries.length} paths`;
  }
  if (state.status === 'complete') return `Complete index · ${state.entries.length} paths`;
  if (state.status === 'limit-reached') {
    return `Safety limit reached · ${state.entries.length} paths indexed`;
  }
  if (state.status === 'paused') return `Scan paused · ${state.entries.length} paths indexed`;
  if (state.status === 'partial') {
    return `Partial coverage · ${state.entries.length} paths · ${state.inaccessiblePrefixes.length} inaccessible`;
  }
  return 'Index not started';
}

export default function SearchResults({
  query,
  scope,
  matches,
  indexState,
  onOpen,
  onCancel,
  onContinue,
  onRetry,
}: SearchResultsProps) {
  const visibleMatches = matches.slice(0, MAX_RENDERED_RESULTS);
  const mountSearchReady = query.trim().length >= 2;
  const completeEmpty = scope === 'mount'
    && indexState.status === 'complete'
    && visibleMatches.length === 0;
  const partialEmpty = scope === 'mount'
    && indexState.status !== 'complete'
    && visibleMatches.length === 0
    && mountSearchReady;

  return (
    <div className="min-h-0">
      {scope === 'mount' && (
        <div className="flex min-h-9 flex-wrap items-center gap-2 border-b border-background-200 bg-background-100/60 px-3 py-1.5 text-[10px] text-foreground-500">
          <span className="font-medium">{coverageText(indexState)}</span>
          {indexState.status === 'scanning' && (
            <button
              type="button"
              onClick={onCancel}
              className="ml-auto rounded px-1.5 py-1 font-semibold text-foreground-700 hover:bg-background-200"
            >
              Cancel scan
            </button>
          )}
          {indexState.status === 'limit-reached' && (
            <button
              type="button"
              onClick={onContinue}
              className="ml-auto rounded px-1.5 py-1 font-semibold text-primary-700 hover:bg-primary-100"
            >
              Continue scan
            </button>
          )}
          {(indexState.status === 'paused' || (
            indexState.status === 'partial' && indexState.failedPrefixes.length > 0
          )) && (
            <button
              type="button"
              onClick={onRetry}
              className="ml-auto rounded px-1.5 py-1 font-semibold text-primary-700 hover:bg-primary-100"
            >
              {indexState.pendingPrefixes.length > 0 ? 'Resume scan' : 'Retry scan'}
            </button>
          )}
        </div>
      )}

      {scope === 'mount' && !mountSearchReady ? (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <i className="ri-radar-line text-xl text-foreground-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-foreground-600">Type at least two characters</p>
          <p className="mt-1 text-xs text-foreground-400">Only logical path names are searched.</p>
        </div>
      ) : completeEmpty ? (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <i className="ri-search-line text-xl text-foreground-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-foreground-600">No matching paths in this mount</p>
          <p className="mt-1 text-xs text-foreground-400">Secret values and keys are never searched.</p>
        </div>
      ) : partialEmpty ? (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <i className="ri-search-eye-line text-xl text-foreground-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-foreground-600">No matches in indexed paths yet</p>
          <p className="mt-1 max-w-sm text-xs leading-5 text-foreground-400">
            Coverage is incomplete. Continue, resume, or retry the scan before treating this as absence.
          </p>
        </div>
      ) : visibleMatches.length === 0 ? (
        <div className="flex flex-col items-center justify-center px-4 py-16 text-center">
          <i className="ri-search-line text-xl text-foreground-300" aria-hidden="true" />
          <p className="mt-2 text-sm font-medium text-foreground-600">No matches in this folder</p>
        </div>
      ) : (
        <div role="list" aria-label="Search results" className="divide-y divide-background-100">
          {visibleMatches.map(({ entry }) => (
            <div
              key={`${entry.kind}:${entry.path}`}
              role="listitem"
            >
              <button
                type="button"
                aria-label={`Open ${entry.kind} ${entry.path}`}
                onClick={() => onOpen(entry)}
                className="grid min-h-11 w-full grid-cols-[32px_minmax(0,1fr)_auto] items-center gap-2 px-3 py-2 text-left hover:bg-background-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400"
              >
                <i
                  className={`${entry.kind === 'folder' ? 'ri-folder-3-line text-warning-500' : 'ri-key-2-line text-foreground-400'} text-sm`}
                  aria-hidden="true"
                />
                <span className="min-w-0">
                  <span className="block truncate font-mono text-xs font-medium text-foreground-800">
                    <HighlightedText value={entry.name} query={query} />
                    {entry.kind === 'folder' ? '/' : ''}
                  </span>
                  <span className="block truncate font-mono text-[10px] text-foreground-400">
                    <HighlightedText value={entry.path} query={query} />
                  </span>
                </span>
                <span className="rounded bg-background-200 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-foreground-500">
                  {entry.kind}
                </span>
              </button>
            </div>
          ))}
          {matches.length > MAX_RENDERED_RESULTS && (
            <p className="px-3 py-2 text-center text-[10px] text-foreground-400">
              Showing the first {MAX_RENDERED_RESULTS} of {matches.length} matches. Refine the query.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
