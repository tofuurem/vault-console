interface ContentSkeletonProps {
  readonly label: string;
  readonly variant?: 'workspace' | 'list' | 'detail';
  readonly compact?: boolean;
}

export default function ContentSkeleton({
  label,
  variant = 'workspace',
  compact = false,
}: ContentSkeletonProps) {
  if (compact) {
    return (
      <div role="status" aria-label={label} className="flex min-h-9 items-center gap-2 px-3 py-2">
        <span className="h-3 w-3 animate-pulse rounded bg-background-200" />
        <span className="h-2.5 w-32 max-w-[60%] animate-pulse rounded bg-background-200" />
        <span className="sr-only">{label}</span>
      </div>
    );
  }

  return (
    <div
      role="status"
      aria-label={label}
      className="flex h-full min-h-0 w-full flex-col overflow-hidden"
    >
      <span className="sr-only">{label}</span>
      {variant === 'workspace' && (
        <div className="shrink-0 space-y-2 border-b border-background-200 px-4 py-3">
          <div className="h-2.5 w-20 animate-pulse rounded bg-background-200" />
          <div className="h-4 w-44 animate-pulse rounded bg-background-200" />
          <div className="h-8 w-full max-w-md animate-pulse rounded-md bg-background-100" />
        </div>
      )}
      {variant === 'detail' && (
        <div className="shrink-0 space-y-2 border-b border-background-200 px-5 py-4">
          <div className="h-3 w-36 animate-pulse rounded bg-background-200" />
          <div className="h-5 w-56 max-w-[70%] animate-pulse rounded bg-background-200" />
        </div>
      )}
      <div className={`flex-1 space-y-px ${variant === 'detail' ? 'p-4' : 'p-3'}`}>
        {Array.from({ length: variant === 'detail' ? 4 : 6 }, (_, index) => (
          <div
            key={index}
            className={`${variant === 'detail' ? 'h-16 rounded-md' : 'h-10 rounded'} animate-pulse bg-background-100`}
          />
        ))}
      </div>
    </div>
  );
}
