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
}

export default function SecretTable({
  entries,
  selectedPath,
  onSelectSecret,
  onNavigateToFolder,
  onCreateSecret,
}: SecretTableProps) {
  if (entries.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center px-4 py-20 text-center">
        <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-background-200">
          <i className="ri-folder-open-line text-xl text-foreground-400" aria-hidden="true" />
        </div>
        <p className="text-sm font-medium text-foreground-600">This folder is empty</p>
        <p className="mt-1 text-xs text-foreground-400">Vault returned no secrets or subfolders.</p>
        {onCreateSecret && (
          <button type="button" onClick={onCreateSecret} className="mt-4 flex h-8 items-center gap-1.5 rounded-md bg-primary-500 px-3 text-xs font-medium text-background-50 hover:bg-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
            <i className="ri-add-line text-sm" aria-hidden="true" /> Create secret
          </button>
        )}
      </div>
    );
  }

  return (
    <table className="w-full">
      <thead>
        <tr className="border-b border-background-200">
          <th aria-label="Type" className="w-10 px-3 py-2" />
          <th className="px-0 py-2 text-left text-[11px] font-medium text-foreground-500">Name</th>
          <th className="w-28 px-3 py-2 text-left text-[11px] font-medium text-foreground-500">Type</th>
          <th className="hidden px-3 py-2 text-left text-[11px] font-medium text-foreground-500 md:table-cell">Logical path</th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry) => {
          const selected = entry.kind === 'secret' && selectedPath === entry.path;
          return (
            <tr
              key={`${entry.kind}:${entry.path}`}
              className={`group border-b border-background-100 transition-colors ${selected ? 'bg-primary-50/70' : 'hover:bg-background-100 focus-within:bg-background-100'}`}
            >
              <td className="px-3 py-2.5">
                <i className={`${entry.kind === 'folder' ? 'ri-folder-3-line text-amber-500' : 'ri-key-2-line text-foreground-400'} text-sm`} aria-hidden="true" />
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
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}
