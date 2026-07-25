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
  readonly selectedPaths?: readonly string[];
  readonly onSelectionChange?: (
    entry: KvDirectoryEntry,
    checked: boolean,
    range: boolean,
  ) => void;
  readonly onToggleSelectAll?: () => void;
  readonly emptyReason?: 'folder' | 'filter';
}

export default function SecretTable({
  entries,
  selectedPath,
  onSelectSecret,
  onNavigateToFolder,
  onCreateSecret,
  isFavorite,
  onToggleFavorite,
  selectedPaths = [],
  onSelectionChange,
  onToggleSelectAll,
  emptyReason = 'folder',
}: SecretTableProps) {
  if (entries.length === 0) {
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
          <button type="button" onClick={onCreateSecret} className="mt-4 flex h-8 items-center gap-1.5 rounded-md bg-primary-500 px-3 text-xs font-medium text-background-50 hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
            <i className="ri-add-line text-sm" aria-hidden="true" /> Create secret
          </button>
        )}
      </div>
    );
  }

  const selectable = Boolean(onSelectionChange && onToggleSelectAll);
  const visibleSecretPaths = entries
    .filter((entry) => entry.kind === 'secret')
    .map((entry) => entry.path);
  const selectedSet = new Set(selectedPaths);
  const selectedVisibleCount = visibleSecretPaths
    .filter((path) => selectedSet.has(path))
    .length;
  const allVisibleSelected = visibleSecretPaths.length > 0
    && selectedVisibleCount === visibleSecretPaths.length;
  const selectAllState = allVisibleSelected
    ? true
    : selectedVisibleCount > 0 ? 'mixed' as const : false;

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-background-200">
          {selectable && (
            <th className="w-12 px-0 py-0">
              <button
                type="button"
                role="checkbox"
                aria-checked={selectAllState}
                aria-label={allVisibleSelected
                  ? 'Clear visible secret selection'
                  : 'Select all visible secrets'}
                disabled={visibleSecretPaths.length === 0}
                onClick={onToggleSelectAll}
                className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-500 disabled:cursor-not-allowed disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
              >
                <i
                  className={`${allVisibleSelected
                    ? 'ri-checkbox-fill'
                    : selectedVisibleCount > 0
                      ? 'ri-checkbox-indeterminate-fill'
                      : 'ri-checkbox-blank-line'} text-base`}
                  aria-hidden="true"
                />
              </button>
            </th>
          )}
          <th aria-label="Type" className="w-10 px-3 py-2" />
          <th className="px-0 py-2 text-left text-[11px] font-medium text-foreground-500">Name</th>
          <th className="w-28 px-3 py-2 text-left text-[11px] font-medium text-foreground-500">Type</th>
          <th className="hidden px-3 py-2 text-left text-[11px] font-medium text-foreground-500 md:table-cell">Logical path</th>
          {onToggleFavorite && <th aria-label="Favorite" className="w-10 px-2 py-2" />}
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const selected = entry.kind === 'secret' && selectedPath === entry.path;
          const bulkSelected = entry.kind === 'secret' && selectedSet.has(entry.path);
          const favorite = isFavorite?.(entry) ?? false;
          return (
            <tr
              key={`${entry.kind}:${entry.path}`}
              className={`group border-b border-background-100 transition-colors ${selected ? 'bg-primary-50/70' : 'hover:bg-background-100 focus-within:bg-background-100'}`}
            >
              {selectable && (
                <td className="w-12 px-0 py-0">
                  {entry.kind === 'secret' && (
                    <button
                      type="button"
                      role="checkbox"
                      aria-checked={bulkSelected}
                      aria-label={`${bulkSelected ? 'Deselect' : 'Select'} secret ${entry.path}`}
                      onClick={(event) => onSelectionChange?.(
                        entry,
                        !bulkSelected,
                        event.shiftKey,
                      )}
                      className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                    >
                      <i
                        className={`${bulkSelected
                          ? 'ri-checkbox-fill text-primary-600'
                          : 'ri-checkbox-blank-line'} text-base`}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </td>
              )}
              <td className="px-3 py-2.5">
                <i className={`${entry.kind === 'folder' ? 'ri-folder-3-line text-warning-500' : 'ri-key-2-line text-foreground-400'} text-sm`} aria-hidden="true" />
              </td>
              <td className="px-0 py-2.5">
                <button
                  type="button"
                  aria-label={`${entry.kind === 'folder' ? 'Open folder' : 'Inspect secret'} ${entry.path}`}
                  aria-current={selected ? 'true' : undefined}
                  onClick={() => entry.kind === 'folder' ? onNavigateToFolder(entry.path) : onSelectSecret(entry.path)}
                  className="min-h-8 w-full rounded-sm text-left font-mono text-sm font-medium text-foreground-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
                >
                  {entry.name}{entry.kind === 'folder' ? '/' : ''}
                </button>
              </td>
              <td className="px-3 py-2.5 text-xs text-foreground-500">{entry.kind === 'folder' ? 'Folder' : 'Secret'}</td>
              <td className="hidden px-3 py-2.5 font-mono text-[11px] text-foreground-400 md:table-cell">{entry.path}</td>
              {onToggleFavorite && (
                <td className="px-2 py-2">
                  <button
                    type="button"
                    aria-label={`${favorite ? 'Unpin' : 'Pin'} ${entry.kind} ${entry.path}`}
                    aria-pressed={favorite}
                    onClick={() => onToggleFavorite(entry)}
                    className={`flex h-7 w-7 items-center justify-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
                      favorite
                        ? 'text-warning-600 hover:bg-warning-100'
                        : 'text-foreground-300 hover:bg-background-200 hover:text-warning-600'
                    }`}
                  >
                    <i className={favorite ? 'ri-star-fill' : 'ri-star-line'} aria-hidden="true" />
                  </button>
                </td>
              )}
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
