import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';

import { useKeyboardShortcut } from '@/application/shortcuts/useKeyboardShortcut';
import type {
  KvSecretSummaries,
  KvSecretSummaryState,
} from '@/application/vault/useKvSecretSummaries';
import Skeleton from '@/components/base/Skeleton';
import { formatDateTime, formatRelativeTime } from '@/shared/format/date-time';
import {
  DEFAULT_SECRET_TABLE_SORT,
  nextSecretTableSort,
  sortDirectoryEntries,
  type SecretTableSort,
  type SecretTableSortKey,
} from './secret-table-sort';
import { ROW_PATH_ATTRIBUTE, useRowVisibility } from './useRowVisibility';

export interface KvDirectoryEntry {
  readonly kind: 'folder' | 'secret';
  readonly name: string;
  readonly path: string;
}

interface SecretTableProps {
  readonly entries: readonly KvDirectoryEntry[];
  readonly selectedPath: string | null;
  readonly onSelectSecret: (path: string) => void;
  readonly onNavigateToFolder: (path: string) => void;
  readonly onCreateSecret?: () => void;
  readonly isFavorite?: (entry: KvDirectoryEntry) => boolean;
  readonly onToggleFavorite?: (entry: KvDirectoryEntry) => void;
  readonly onDeletePermanently?: (path: string) => void;
  readonly selectedPaths?: readonly string[];
  readonly onSelectionChange?: (
    entry: KvDirectoryEntry,
    checked: boolean,
    range: boolean,
  ) => void;
  readonly onToggleSelectAll?: () => void;
  readonly emptyReason?: 'folder' | 'filter';
  /** Row metadata keyed by secret path; rows without an entry show a dash. */
  readonly summaries?: KvSecretSummaries;
  /** Called with secret paths the first time their rows scroll into view. */
  readonly onRowsSeen?: (paths: readonly string[]) => void;
  /** Secret paths in the order the table shows them, for range selection. */
  readonly onDisplayOrderChange?: (secretPaths: readonly string[]) => void;
}

const FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400';
const ROW_PRIMARY_ATTRIBUTE = 'data-row-primary';
const HEADER_CELL = 'px-3 py-2 text-left text-[11px] font-medium text-foreground-500';
const COLUMN = {
  type: 'hidden w-24 xl:table-cell',
  updated: 'hidden w-24 min-[420px]:table-cell',
  version: 'hidden w-20 md:table-cell',
  owner: 'hidden w-36 lg:table-cell',
} as const;

function EmptyDirectory({
  emptyReason,
  onCreateSecret,
}: Pick<SecretTableProps, 'emptyReason' | 'onCreateSecret'>) {
  return (
    <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
      <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-background-200">
        <i className="ri-folder-open-line text-xl text-foreground-400" aria-hidden="true" />
      </div>
      <p className="text-sm font-medium text-foreground-600">
        {emptyReason === 'filter' ? 'No matches in this folder' : 'This folder is empty'}
      </p>
      <p className="mt-1 text-xs text-foreground-400">
        {emptyReason === 'filter'
          ? 'Try a different logical path filter.'
          : 'Vault returned no secrets or subfolders.'}
      </p>
      {onCreateSecret && emptyReason === 'folder' && (
        <button type="button" onClick={onCreateSecret} className={`mt-4 flex h-11 items-center gap-1.5 rounded-md bg-primary-500 px-3 text-xs font-medium text-background-50 hover:bg-primary-600 ${FOCUS_RING} sm:h-8`}>
          <i className="ri-add-line text-sm" aria-hidden="true" /> Create secret
        </button>
      )}
    </div>
  );
}

type RowFocusTarget = 'next' | 'previous' | 'first' | 'last';

const ROW_KEYS: Readonly<Record<string, RowFocusTarget>> = {
  ArrowDown: 'next',
  ArrowUp: 'previous',
  Home: 'first',
  End: 'last',
};

function rowFocusIndex(target: RowFocusTarget, current: number, count: number): number {
  if (target === 'first') return 0;
  if (target === 'last') return count - 1;
  if (current < 0) return target === 'next' ? 0 : count - 1;
  const step = target === 'next' ? 1 : -1;
  return Math.min(count - 1, Math.max(0, current + step));
}

/** Moves focus between the rows' open buttons; returns false when there are none. */
function focusRow(
  table: HTMLTableElement | null,
  target: RowFocusTarget,
  from: Element | null,
): boolean {
  if (!table) return false;
  const buttons = [...table.querySelectorAll<HTMLElement>(`[${ROW_PRIMARY_ATTRIBUTE}]`)];
  if (buttons.length === 0) return false;
  const currentRow = from?.closest('tr');
  const current = buttons.findIndex((button) => button.closest('tr') === currentRow);
  buttons[rowFocusIndex(target, current, buttons.length)].focus();
  return true;
}

function selectedRowButton(table: HTMLTableElement | null): HTMLElement | null {
  return table?.querySelector<HTMLElement>(`[${ROW_PRIMARY_ATTRIBUTE}][aria-current="true"]`) ?? null;
}

/** Arrow keys reach the table from the page too, while nothing else has focus. */
function usePageRowNavigation(tableRef: RefObject<HTMLTableElement | null>) {
  useKeyboardShortcut(['ArrowDown', 'ArrowUp'], (event) => {
    const table = tableRef.current;
    const active = document.activeElement;
    const pageFocused = !active || active === document.body
      || (active instanceof HTMLElement && !active.matches('button, a, [role]') && Boolean(table && active.contains(table)));
    if (!table || !pageFocused) return false;
    const selected = selectedRowButton(table);
    if (selected) {
      selected.focus();
      return true;
    }
    return focusRow(table, event.key === 'ArrowDown' ? 'first' : 'last', null);
  });
}

function sortedSecretPaths(entries: readonly KvDirectoryEntry[]): readonly string[] {
  return entries.filter((entry) => entry.kind === 'secret').map((entry) => entry.path);
}

export default function SecretTable(props: SecretTableProps) {
  const {
    entries,
    selectedPath,
    selectedPaths = [],
    onSelectionChange,
    onToggleSelectAll,
    summaries,
    onRowsSeen,
    onDisplayOrderChange,
  } = props;
  const [sort, setSort] = useState<SecretTableSort>(DEFAULT_SECRET_TABLE_SORT);
  const tableRef = useRef<HTMLTableElement>(null);
  const observeRow = useRowVisibility(onRowsSeen);
  const rows = useMemo(
    () => sortDirectoryEntries(entries, sort, summaries),
    [entries, sort, summaries],
  );
  const displayOrder = useMemo(() => sortedSecretPaths(rows), [rows]);
  usePageRowNavigation(tableRef);
  useEffect(() => {
    onDisplayOrderChange?.(displayOrder);
  }, [displayOrder, onDisplayOrderChange]);

  if (entries.length === 0) {
    return <EmptyDirectory emptyReason={props.emptyReason ?? 'folder'} onCreateSecret={props.onCreateSecret} />;
  }

  const selectable = Boolean(onSelectionChange && onToggleSelectAll);
  const selectedSet = new Set(selectedPaths);
  const handleKeyDown = (event: ReactKeyboardEvent<HTMLTableElement>) => {
    const target = ROW_KEYS[event.key];
    if (!target || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (focusRow(tableRef.current, target, event.target as Element)) event.preventDefault();
  };

  return (
    <table ref={tableRef} className="w-full" onKeyDown={handleKeyDown}>
      <caption className="sr-only">
        Folder contents. Use the up and down arrow keys to move between rows and Enter to open one.
      </caption>
      <SecretTableHeader
        {...props}
        selectable={selectable}
        selectedSet={selectedSet}
        sort={sort}
        onSort={(key) => setSort((current) => nextSecretTableSort(current, key))}
      />
      <tbody>
        {rows.map((entry) => (
          <SecretTableRow
            key={`${entry.kind}:${entry.path}`}
            {...props}
            entry={entry}
            rowRef={observeRow}
            summary={summaries?.get(entry.path)}
            selected={entry.kind === 'secret' && selectedPath === entry.path}
            bulkSelected={entry.kind === 'secret' && selectedSet.has(entry.path)}
            favorite={props.isFavorite?.(entry) ?? false}
            selectable={selectable}
          />
        ))}
      </tbody>
    </table>
  );
}

function selectAllPresentation(visibleSecretPaths: readonly string[], selectedSet: ReadonlySet<string>) {
  const selectedVisibleCount = visibleSecretPaths.filter((path) => selectedSet.has(path)).length;
  const allVisibleSelected = visibleSecretPaths.length > 0
    && selectedVisibleCount === visibleSecretPaths.length;
  return {
    allVisibleSelected,
    state: allVisibleSelected ? true : selectedVisibleCount > 0 ? 'mixed' as const : false,
    icon: allVisibleSelected
      ? 'ri-checkbox-fill'
      : selectedVisibleCount > 0 ? 'ri-checkbox-indeterminate-fill' : 'ri-checkbox-blank-line',
  };
}

function SecretTableHeader({
  entries,
  selectable,
  selectedSet,
  onToggleSelectAll,
  onToggleFavorite,
  onDeletePermanently,
  sort,
  onSort,
}: SecretTableProps & {
  readonly selectable: boolean;
  readonly selectedSet: ReadonlySet<string>;
  readonly sort: SecretTableSort;
  readonly onSort: (key: SecretTableSortKey) => void;
}) {
  const visibleSecretPaths = sortedSecretPaths(entries);
  const selectAll = selectAllPresentation(visibleSecretPaths, selectedSet);
  return (
    <thead>
      <tr className="border-b border-background-200">
        {selectable && (
          <th className="w-12 px-0 py-0">
            <button
              type="button"
              role="checkbox"
              aria-checked={selectAll.state}
              aria-label={selectAll.allVisibleSelected
                ? 'Clear visible secret selection'
                : 'Select all visible secrets'}
              disabled={visibleSecretPaths.length === 0}
              onClick={onToggleSelectAll}
              className={`flex h-11 w-11 items-center justify-center rounded-md text-foreground-500 disabled:cursor-not-allowed disabled:opacity-30 ${FOCUS_RING}`}
            >
              <i className={`${selectAll.icon} text-base`} aria-hidden="true" />
            </button>
          </th>
        )}
        <th aria-label="Type" className="w-10 px-3 py-2" />
        <SortableHeader label="Name" sortKey="name" sort={sort} onSort={onSort} className="px-0" />
        <th className={`${HEADER_CELL} ${COLUMN.type}`}>Type</th>
        <SortableHeader label="Updated" sortKey="updated" sort={sort} onSort={onSort} className={`px-3 ${COLUMN.updated}`} />
        <SortableHeader label="Version" sortKey="version" sort={sort} onSort={onSort} className={`px-3 ${COLUMN.version}`} align="right" />
        <th className={`${HEADER_CELL} ${COLUMN.owner}`}>Owner</th>
        {onToggleFavorite && <th aria-label="Favorite" className="w-10 px-2 py-2" />}
        {onDeletePermanently && <th aria-label="Actions" className="w-10 px-2 py-2" />}
      </tr>
    </thead>
  );
}

function SortableHeader({
  label,
  sortKey,
  sort,
  onSort,
  className,
  align = 'left',
}: {
  readonly label: string;
  readonly sortKey: SecretTableSortKey;
  readonly sort: SecretTableSort;
  readonly onSort: (key: SecretTableSortKey) => void;
  readonly className: string;
  readonly align?: 'left' | 'right';
}) {
  const active = sort.key === sortKey;
  const icon = !active
    ? 'ri-arrow-up-down-line text-foreground-300 opacity-0 group-hover:opacity-100 group-focus-visible:opacity-100'
    : sort.direction === 'ascending' ? 'ri-arrow-up-line' : 'ri-arrow-down-line';
  return (
    <th aria-sort={active ? sort.direction : undefined} className={`py-1 ${className}`}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`group inline-flex min-h-11 w-full items-center gap-1 rounded-sm text-[11px] font-medium sm:min-h-7 ${align === 'right' ? 'justify-end' : 'justify-start'} ${active ? 'text-foreground-800' : 'text-foreground-500 hover:text-foreground-800'} ${FOCUS_RING}`}
      >
        {label}
        <i className={`${icon} text-xs motion-safe:transition-opacity`} aria-hidden="true" />
      </button>
    </th>
  );
}

function entryPresentation(entry: KvDirectoryEntry) {
  if (entry.kind === 'folder') {
    return {
      icon: 'ri-folder-3-line text-warning-500',
      action: 'Open folder',
      name: `${entry.name}/`,
      type: 'Folder',
    };
  }
  return {
    icon: 'ri-key-2-line text-foreground-400',
    action: 'Inspect secret',
    name: entry.name,
    type: 'Secret',
  };
}

function Unavailable() {
  return (
    <>
      <span aria-hidden="true" className="text-foreground-300">—</span>
      <span className="sr-only">Not available</span>
    </>
  );
}

function summaryCell(
  entry: KvDirectoryEntry,
  summary: KvSecretSummaryState | undefined,
  render: (data: Extract<KvSecretSummaryState, { status: 'success' }>['data']) => ReactNode,
): ReactNode {
  if (entry.kind === 'folder' || !summary || summary.status === 'unavailable') return <Unavailable />;
  if (summary.status === 'loading') {
    return <span aria-hidden="true"><Skeleton className="inline-block h-3 w-10 align-middle" /></span>;
  }
  return render(summary.data) ?? <Unavailable />;
}

function UpdatedValue({ updatedTime }: { readonly updatedTime: string }) {
  return (
    <time dateTime={updatedTime} title={formatDateTime(updatedTime)}>
      {formatRelativeTime(updatedTime)}
    </time>
  );
}

interface SecretTableRowProps extends SecretTableProps {
  readonly entry: KvDirectoryEntry;
  readonly rowRef: (element: HTMLTableRowElement | null) => (() => void) | undefined;
  readonly summary?: KvSecretSummaryState;
  readonly selected: boolean;
  readonly bulkSelected: boolean;
  readonly favorite: boolean;
  readonly selectable: boolean;
}

function SecretTableRow({
  entry,
  rowRef,
  summary,
  selected,
  bulkSelected,
  favorite,
  selectable,
  onSelectSecret,
  onNavigateToFolder,
  onSelectionChange,
  onToggleFavorite,
  onDeletePermanently,
}: SecretTableRowProps) {
  const presentation = entryPresentation(entry);
  const open = () => entry.kind === 'folder'
    ? onNavigateToFolder(entry.path)
    : onSelectSecret(entry.path);
  const rowPathAttribute = entry.kind === 'secret' ? { [ROW_PATH_ATTRIBUTE]: entry.path } : {};
  return (
    <tr ref={rowRef} {...rowPathAttribute} className={`group border-b border-background-100 transition-colors ${selected ? 'bg-primary-50/70' : 'hover:bg-background-100 focus-within:bg-background-100'}`}>
      {selectable && (
        <td className="w-12 px-0 py-0">
          {entry.kind === 'secret' && (
            <button
              type="button"
              role="checkbox"
              aria-checked={bulkSelected}
              aria-label={`${bulkSelected ? 'Deselect' : 'Select'} secret ${entry.path}`}
              onClick={(event) => onSelectionChange?.(entry, !bulkSelected, event.shiftKey)}
              className={`flex h-11 w-11 items-center justify-center rounded-md text-foreground-500 ${FOCUS_RING}`}
            >
              <i className={`${bulkSelected ? 'ri-checkbox-fill text-primary-600' : 'ri-checkbox-blank-line'} text-base`} aria-hidden="true" />
            </button>
          )}
        </td>
      )}
      <td className="px-3 py-2.5"><i className={`${presentation.icon} text-sm`} aria-hidden="true" /></td>
      <td className="px-0 py-2.5">
        <button type="button" {...{ [ROW_PRIMARY_ATTRIBUTE]: '' }} aria-label={`${presentation.action} ${entry.path}`} aria-current={selected ? 'true' : undefined} onClick={open} className={`min-h-11 w-full rounded-sm text-left font-mono text-sm font-medium text-foreground-800 ${FOCUS_RING} sm:min-h-8`}>
          {presentation.name}
        </button>
      </td>
      <td className={`px-3 py-2.5 text-xs text-foreground-500 ${COLUMN.type}`}>{presentation.type}</td>
      <td className={`whitespace-nowrap px-3 py-2.5 text-xs tabular-nums text-foreground-500 ${COLUMN.updated}`}>
        {summaryCell(entry, summary, (data) => (data.updatedTime ? <UpdatedValue updatedTime={data.updatedTime} /> : null))}
      </td>
      <td className={`px-3 py-2.5 text-right text-xs tabular-nums text-foreground-500 ${COLUMN.version}`}>
        {summaryCell(entry, summary, (data) => data.currentVersion ?? null)}
      </td>
      <td className={`max-w-[9rem] truncate px-3 py-2.5 text-xs text-foreground-500 ${COLUMN.owner}`}>
        {summaryCell(entry, summary, (data) => (data.owner ? <span title={data.owner}>{data.owner}</span> : null))}
      </td>
      {onToggleFavorite && (
        <td className="px-2 py-2">
          <button type="button" aria-label={`${favorite ? 'Unpin' : 'Pin'} ${entry.kind} ${entry.path}`} aria-pressed={favorite} onClick={() => onToggleFavorite(entry)} className={`flex h-11 w-11 items-center justify-center rounded-md ${FOCUS_RING} sm:h-7 sm:w-7 ${favorite ? 'text-warning-600 hover:bg-warning-100' : 'text-foreground-300 hover:bg-background-200 hover:text-warning-600'}`}>
            <i className={favorite ? 'ri-star-fill' : 'ri-star-line'} aria-hidden="true" />
          </button>
        </td>
      )}
      {onDeletePermanently && (
        <td className="px-2 py-2">
          {entry.kind === 'secret' && (
            <button type="button" aria-label={`Delete key permanently ${entry.path}`} onClick={() => onDeletePermanently(entry.path)} className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-300 hover:bg-danger-50 hover:text-danger-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-400 sm:h-7 sm:w-7">
              <i className="ri-delete-bin-7-line" aria-hidden="true" />
            </button>
          )}
        </td>
      )}
    </tr>
  );
}
