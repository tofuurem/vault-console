interface BulkToolbarProps {
  readonly selectedCount: number;
  readonly hiddenSelectedCount: number;
  readonly onCopyPaths: () => void;
  readonly onPin: () => void;
  readonly onUnpin: () => void;
  readonly onClear: () => void;
  readonly onSoftDelete?: () => void;
  readonly onDestroy?: () => void;
  readonly onPermanentDelete?: () => void;
}

export default function BulkToolbar({
  selectedCount,
  hiddenSelectedCount,
  onCopyPaths,
  onPin,
  onUnpin,
  onClear,
  onSoftDelete,
  onDestroy,
  onPermanentDelete,
}: BulkToolbarProps) {
  if (selectedCount === 0) return null;
  return (
    <div
      role="toolbar"
      aria-label="Bulk secret actions"
      className="flex min-h-12 flex-wrap items-center gap-1.5 border-b border-primary-200 bg-primary-50 px-3 py-1.5"
    >
      <span className="mr-1 text-xs font-semibold text-primary-800">
        {selectedCount} selected
      </span>
      {hiddenSelectedCount > 0 && (
        <span className="mr-1 text-[10px] text-primary-600">
          {hiddenSelectedCount} hidden by filter
        </span>
      )}
      <button type="button" onClick={onCopyPaths} className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-foreground-700 hover:bg-background-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-9">
        <i className="ri-file-copy-line" aria-hidden="true" /> Copy paths
      </button>
      <button type="button" onClick={onPin} className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-foreground-700 hover:bg-background-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-9">
        <i className="ri-star-line" aria-hidden="true" /> Pin
      </button>
      <button type="button" onClick={onUnpin} className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-foreground-700 hover:bg-background-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-9">
        <i className="ri-star-off-line" aria-hidden="true" /> Unpin
      </button>
      {onSoftDelete && (
        <button type="button" onClick={onSoftDelete} className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-warning-800 hover:bg-warning-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-warning-500 sm:min-h-9">
          <i className="ri-delete-bin-line" aria-hidden="true" /> Soft-delete latest
        </button>
      )}
      {onDestroy && (
        <button type="button" onClick={onDestroy} className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[11px] font-medium text-danger-700 hover:bg-danger-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 sm:min-h-9">
          <i className="ri-close-circle-line" aria-hidden="true" /> Destroy versions…
        </button>
      )}
      {onPermanentDelete && (
        <button type="button" onClick={onPermanentDelete} className="flex min-h-11 items-center gap-1.5 rounded-md px-2 text-[11px] font-semibold text-danger-700 hover:bg-danger-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger-500 sm:min-h-9">
          <i className="ri-delete-bin-7-line" aria-hidden="true" /> Delete keys permanently…
        </button>
      )}
      <button type="button" onClick={onClear} className="ml-auto min-h-11 rounded-md px-2 text-[11px] font-medium text-primary-700 underline underline-offset-2 hover:bg-primary-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-9">
        Clear selection
      </button>
    </div>
  );
}
