import {
  useEffect,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react';

import { useKvSearch } from '@/application/vault/search/KvSearchContext';
import type { UserAccessReportResource } from '@/application/vault/useUserAccessReport';
import {
  resolveEffectiveKvTree,
  type EffectiveKvPermissionLevel,
  type KvAccessTreeNode,
} from '@/domain/access-control/effective-access';
import type { KvPathEntry } from '@/domain/vault/search';
import AccessExplanation, {
  type ExplainableAccessTarget,
} from './AccessExplanation';

type MatrixScope = 'policy' | 'visible';

interface EffectiveAccessMatrixProps {
  readonly resource: UserAccessReportResource;
}

const LEVEL_PRESENTATION: Record<EffectiveKvPermissionLevel, {
  readonly label: string;
  readonly classes: string;
}> = {
  none: { label: 'None', classes: 'bg-background-200 text-foreground-600' },
  view: { label: 'View', classes: 'bg-primary-100 text-primary-800' },
  edit: { label: 'Edit', classes: 'bg-secondary-100 text-secondary-800' },
  'manage-versions': {
    label: 'Manage versions',
    classes: 'bg-accent-100 text-accent-800',
  },
  owner: { label: 'Owner', classes: 'bg-success-100 text-success-800' },
  deny: { label: 'Deny', classes: 'bg-danger-100 text-danger-800' },
  custom: { label: 'Custom', classes: 'bg-warning-100 text-warning-900' },
};

function normalizedEntryPath(entry: KvPathEntry): string {
  return entry.path.replace(/\/+$/, '');
}

function nodeFromEntry(entry: KvPathEntry): KvAccessTreeNode {
  const path = normalizedEntryPath(entry);
  return {
    id: `${entry.mount}:${entry.kind}:${path}`,
    label: entry.name,
    mount: entry.mount,
    path,
    target: entry.kind,
    children: [],
  };
}

function sourceLabel(target: ExplainableAccessTarget): readonly string[] {
  return [
    ...new Set(target.sources.map((source) => (
      source.kind === 'group' && source.via
        ? `${source.label} → ${source.via}`
        : source.label
    ))),
  ];
}

function fullPath(target: ExplainableAccessTarget): string {
  const suffix = target.target === 'folder' && target.path ? '/' : '';
  return `${target.mount}/${target.path}${suffix}`;
}

function mergeTargets(
  resource: UserAccessReportResource,
  entries: readonly KvPathEntry[],
): readonly ExplainableAccessTarget[] {
  const policyTargets = resource.report.targets;
  const policyIds = new Set(policyTargets.map((target) => target.id));
  const visibleNodes = entries
    .map(nodeFromEntry)
    .filter((node) => !policyIds.has(node.id));
  const visibleTargets = resolveEffectiveKvTree(visibleNodes, resource.report.rules);
  return [...policyTargets, ...visibleTargets]
    .sort((left, right) => (
      left.mount.localeCompare(right.mount)
      || left.path.localeCompare(right.path)
      || left.target.localeCompare(right.target)
    ));
}

function scanStatusLabel(status: ReturnType<ReturnType<typeof useKvSearch>['stateFor']>['status']): string {
  if (status === 'scanning') return 'Scanning metadata…';
  if (status === 'complete') return 'Discovery complete';
  if (status === 'partial') return 'Partial coverage';
  if (status === 'paused') return 'Discovery paused';
  if (status === 'limit-reached') return 'Scan limit reached';
  return 'Not scanned';
}

export default function EffectiveAccessMatrix({
  resource,
}: EffectiveAccessMatrixProps) {
  const search = useKvSearch();
  const [scope, setScope] = useState<MatrixScope>('policy');
  const [query, setQuery] = useState('');
  const [activeMount, setActiveMount] = useState(resource.mounts[0] ?? '');
  const [selectedId, setSelectedId] = useState<string>();
  const mountStates = resource.mounts.map((mount) => search.stateFor(mount));
  const activeState = search.stateFor(activeMount);
  const discoveredEntries = mountStates.flatMap((state) => state.entries);
  const targets = useMemo(
    () => scope === 'policy'
      ? resource.report.targets
      : mergeTargets(resource, discoveredEntries),
    [discoveredEntries, resource, scope],
  );
  const filteredTargets = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return targets;
    return targets.filter((target) => (
      fullPath(target).toLowerCase().includes(normalized)
      || target.level.toLowerCase().includes(normalized)
      || sourceLabel(target).some((source) => source.toLowerCase().includes(normalized))
    ));
  }, [query, targets]);
  const selectedTarget = targets.find((target) => target.id === selectedId);
  const incomplete = resource.report.completeness.state !== 'complete';
  const hasPartialDiscovery = mountStates.some((state) => (
    state.status === 'partial'
    || state.status === 'paused'
    || state.status === 'limit-reached'
    || state.inaccessiblePrefixes.length > 0
    || state.failedPrefixes.length > 0
  ));

  useEffect(() => {
    if (!resource.mounts.includes(activeMount)) {
      setActiveMount(resource.mounts[0] ?? '');
    }
  }, [activeMount, resource.mounts]);

  useEffect(() => {
    if (selectedId && !targets.some((target) => target.id === selectedId)) {
      setSelectedId(undefined);
    }
  }, [selectedId, targets]);

  const runDiscovery = () => {
    if (!activeMount) return;
    search.activateMount(activeMount);
    if (
      activeState.status === 'partial'
      || activeState.status === 'paused'
      || activeState.status === 'limit-reached'
    ) {
      search.continueScan(activeMount);
      return;
    }
    if (activeState.status === 'complete') {
      search.restart(activeMount);
      return;
    }
    search.start(activeMount);
  };

  const selectAdjacent = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
    event.preventDefault();
    const direction = event.key === 'ArrowDown' ? 1 : -1;
    const nextIndex = (index + direction + filteredTargets.length) % filteredTargets.length;
    const next = filteredTargets[nextIndex];
    setSelectedId(next.id);
    [...document.querySelectorAll<HTMLButtonElement>('[data-access-row]')]
      .find((row) => row.dataset.accessRow === next.id)
      ?.focus();
  };

  return (
    <section aria-labelledby="effective-access-heading">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
            Effective KV v2
          </p>
          <h2 id="effective-access-heading" className="mt-0.5 text-sm font-semibold text-foreground-900">
            Access matrix
          </h2>
          <p className="mt-1 text-[10px] text-foreground-500">
            Logical paths proven by readable policy rules and optional metadata discovery.
          </p>
        </div>
        <div
          role="group"
          aria-label="Access matrix scope"
          className="inline-flex w-full rounded-md border border-background-300 bg-background-100 p-0.5 sm:w-auto"
        >
          <button
            type="button"
            aria-pressed={scope === 'policy'}
            onClick={() => setScope('policy')}
            className={`min-h-10 flex-1 rounded px-2.5 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-7 sm:flex-none ${
              scope === 'policy'
                ? 'bg-background-50 text-foreground-900 shadow-sm'
                : 'text-foreground-500 hover:text-foreground-800'
            }`}
          >
            Policy paths
          </button>
          <button
            type="button"
            aria-pressed={scope === 'visible'}
            onClick={() => setScope('visible')}
            className={`min-h-10 flex-1 rounded px-2.5 text-[10px] font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-7 sm:flex-none ${
              scope === 'visible'
                ? 'bg-background-50 text-foreground-900 shadow-sm'
                : 'text-foreground-500 hover:text-foreground-800'
            }`}
          >
            All visible paths
          </button>
        </div>
      </div>

      {scope === 'visible' && (
        <div className="mt-3 rounded-lg border border-background-200 bg-background-50 p-3">
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <label className="flex min-w-0 flex-1 items-center gap-2">
              <span className="shrink-0 text-[10px] font-medium text-foreground-500">
                Discover mount
              </span>
              <select
                aria-label="Mount to discover"
                value={activeMount}
                onChange={(event) => setActiveMount(event.target.value)}
                className="h-11 min-w-0 flex-1 rounded-md border border-background-300 bg-background-50 px-2 font-mono text-[10px] text-foreground-800 focus:border-primary-400 focus:outline-none sm:h-8"
              >
                {resource.mounts.map((mount) => (
                  <option key={mount} value={mount}>{mount}/</option>
                ))}
              </select>
            </label>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-[10px] text-foreground-500 sm:flex-none">
                {scanStatusLabel(activeState.status)} · {activeState.entries.length} paths
              </span>
              {activeState.status === 'scanning' ? (
                <button
                  type="button"
                  onClick={() => search.cancel(activeMount)}
                  className="min-h-11 rounded-md border border-background-300 px-3 text-[10px] font-semibold text-foreground-700 hover:bg-background-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-8"
                >
                  Cancel
                </button>
              ) : (
                <button
                  type="button"
                  onClick={runDiscovery}
                  disabled={!activeMount}
                  className="min-h-11 rounded-md bg-primary-500 px-3 text-[10px] font-semibold text-on-primary hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 disabled:opacity-50 sm:min-h-8"
                >
                  {activeState.status === 'idle'
                    ? 'Discover visible paths'
                    : activeState.status === 'complete'
                      ? 'Rescan'
                      : 'Continue'}
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-[9px] leading-4 text-foreground-400">
            Uses metadata LIST only. Secret values and JSON keys are never read.
          </p>
          {hasPartialDiscovery && (
            <div role="status" className="mt-2 rounded-md border border-warning-200 bg-warning-50 px-2.5 py-2 text-[10px] text-warning-900">
              Discovery is partial. Inaccessible and failed branches stay unknown; policy-backed paths remain visible.
            </div>
          )}
        </div>
      )}

      <div className="mt-3 overflow-hidden rounded-lg border border-background-200 bg-background-50">
        <div className="flex flex-col gap-2 border-b border-background-200 bg-background-100/70 p-2.5 sm:flex-row sm:items-center sm:justify-between">
          <label className="relative min-w-0 flex-1 sm:max-w-sm">
            <span className="sr-only">Search access paths</span>
            <i className="ri-search-line absolute left-2.5 top-1/2 -translate-y-1/2 text-xs text-foreground-400" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search mount, path, level, or source"
              className="h-11 w-full rounded-md border border-background-300 bg-background-50 pl-7 pr-2.5 text-[11px] text-foreground-800 focus:border-primary-400 focus:outline-none sm:h-8"
            />
          </label>
          <span className="font-mono text-[10px] text-foreground-400">
            {filteredTargets.length} of {targets.length} targets
          </span>
        </div>

        <div role="table" aria-label="Effective KV access by logical path">
          <div
            role="row"
            className="hidden grid-cols-[minmax(0,1fr)_90px_130px_minmax(160px,0.8fr)_28px] border-b border-background-200 px-3 py-2 text-[9px] font-semibold uppercase tracking-wider text-foreground-400 md:grid"
          >
            <span role="columnheader">Logical path</span>
            <span role="columnheader">Target</span>
            <span role="columnheader">Effective</span>
            <span role="columnheader">Sources</span>
            <span role="columnheader" className="sr-only">Completeness</span>
          </div>

          {filteredTargets.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <i className="ri-route-line text-xl text-foreground-300" aria-hidden="true" />
              <p className="mt-2 text-xs font-medium text-foreground-600">
                {targets.length === 0 ? 'No policy-backed KV paths' : 'No paths match this search'}
              </p>
              <p className="mt-1 text-[10px] text-foreground-400">
                Unresolved policies are listed in Access sources below.
              </p>
            </div>
          ) : filteredTargets.map((target, index) => {
            const presentation = LEVEL_PRESENTATION[target.level];
            const sources = sourceLabel(target);
            const selected = selectedId === target.id;
            return (
              <div
                key={target.id}
                role="row"
                className="border-b border-background-100 last:border-0"
              >
                <button
                  type="button"
                  data-access-row={target.id}
                  aria-label={`Explain access to ${fullPath(target)}`}
                  aria-pressed={selected}
                  onClick={() => setSelectedId(selected ? undefined : target.id)}
                  onKeyDown={(event) => selectAdjacent(event, index)}
                  className={`relative grid min-h-14 w-full gap-2 px-3 py-2.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 md:grid-cols-[minmax(0,1fr)_90px_130px_minmax(160px,0.8fr)_28px] md:items-center ${
                    selected
                      ? 'bg-primary-50'
                      : 'hover:bg-background-100'
                  }`}
                >
                  <span role="cell" className="min-w-0">
                    <span className="block truncate font-mono text-[11px] font-medium text-foreground-800" title={fullPath(target)}>
                      {fullPath(target)}
                    </span>
                    <span className="mt-0.5 block text-[9px] text-foreground-400 md:hidden">
                      {target.target === 'folder' ? 'Folder' : 'Secret'}
                    </span>
                  </span>
                  <span role="cell" className="hidden text-[10px] capitalize text-foreground-500 md:block">
                    {target.target}
                  </span>
                  <span role="cell">
                    <span className={`inline-flex rounded-full px-2 py-1 text-[9px] font-semibold ${presentation.classes}`}>
                      {presentation.label}
                    </span>
                  </span>
                  <span role="cell" className="flex min-w-0 flex-wrap gap-1">
                    {sources.length > 0 ? (
                      <>
                        {sources.slice(0, 2).map((source) => (
                          <span
                            key={source}
                            title={source}
                            className="max-w-32 truncate rounded bg-background-200 px-1.5 py-0.5 text-[9px] text-foreground-600"
                          >
                            {source}
                          </span>
                        ))}
                        {sources.length > 2 && (
                          <span className="text-[9px] text-foreground-400">+{sources.length - 2}</span>
                        )}
                      </>
                    ) : (
                      <span className="text-[9px] text-foreground-400">No resolved source</span>
                    )}
                  </span>
                  <span role="cell" className="absolute right-3 top-3 md:static">
                    {incomplete && (
                      <span aria-label="Result may be incomplete" title="Result may be incomplete">
                        <i className="ri-error-warning-line text-xs text-warning-600" aria-hidden="true" />
                      </span>
                    )}
                  </span>
                </button>
                {selected && (
                  <div className="md:hidden">
                    <AccessExplanation target={target} compact />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {selectedTarget && (
        <div className="mt-3 hidden md:block">
          <AccessExplanation target={selectedTarget} />
        </div>
      )}
    </section>
  );
}
