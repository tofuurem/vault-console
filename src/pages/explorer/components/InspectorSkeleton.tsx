import Skeleton from '@/components/base/Skeleton';

const PULSE = 'motion-reduce:animate-none';

/** Key/value rows shaped like the Data tab table. */
export function InspectorRowsSkeleton({ rows = 4 }: { readonly rows?: number }) {
  return (
    <div className="overflow-hidden rounded-md border border-background-200" aria-hidden="true">
      <div className="flex h-7 items-center gap-6 border-b border-background-200 bg-background-100 px-2.5">
        <Skeleton className={`h-2 w-8 ${PULSE}`} />
        <Skeleton className={`h-2 w-10 ${PULSE}`} />
      </div>
      <div className="divide-y divide-background-100">
        {Array.from({ length: rows }, (_, index) => (
          <div key={index} className="grid grid-cols-[minmax(90px,120px)_1fr] items-center gap-2 px-2.5 py-2.5">
            <Skeleton className={`h-3 ${PULSE}`} style={{ width: `${70 - index * 8}%` }} />
            <Skeleton className={`h-3 ${PULSE}`} style={{ width: `${55 + (index % 2) * 20}%` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** Subject rows shaped like the Access tab list. */
export function InspectorListSkeleton({ label, rows = 4 }: { readonly label: string; readonly rows?: number }) {
  return (
    <div role="status" aria-label={label} className="space-y-2 p-3">
      <span className="sr-only">{label}</span>
      <Skeleton className={`h-3 w-40 ${PULSE}`} />
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="space-y-2 rounded-md border border-background-200 px-2.5 py-2" aria-hidden="true">
          <div className="flex items-center justify-between gap-3">
            <Skeleton className={`h-3 ${PULSE}`} style={{ width: `${45 - index * 5}%` }} />
            <div className="flex gap-1">
              <Skeleton className={`h-4 w-10 ${PULSE}`} />
              <Skeleton className={`h-4 w-10 ${PULSE}`} />
            </div>
          </div>
          <Skeleton className={`h-2 w-1/2 ${PULSE}`} />
        </div>
      ))}
    </div>
  );
}

/** Mirrors the loaded Inspector: tab strip, version header, and data rows. */
export default function InspectorSkeleton({ label = 'Loading secret' }: { readonly label?: string }) {
  return (
    <div role="status" aria-label={label} className="flex h-full flex-col">
      <span className="sr-only">{label}</span>
      <div className="flex shrink-0 items-center gap-4 border-b border-background-200 px-3 py-3" aria-hidden="true">
        {[44, 64, 64].map((width, index) => (
          <Skeleton key={index} className={`h-3 ${PULSE}`} style={{ width }} />
        ))}
      </div>
      <div className="space-y-3 p-3" aria-hidden="true">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className={`h-3 w-28 ${PULSE}`} />
          <div className="flex gap-1">
            <Skeleton className={`h-7 w-7 ${PULSE}`} />
            <Skeleton className={`h-7 w-7 ${PULSE}`} />
            <Skeleton className={`h-7 w-20 ${PULSE}`} />
          </div>
        </div>
        <Skeleton className={`h-2.5 w-36 ${PULSE}`} />
        <InspectorRowsSkeleton />
      </div>
    </div>
  );
}
