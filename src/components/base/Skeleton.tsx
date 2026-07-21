import type { CSSProperties } from 'react';

interface SkeletonProps {
  className?: string;
  style?: CSSProperties;
}

export default function Skeleton({ className = '', style }: SkeletonProps) {
  return (
    <div className={`animate-pulse rounded-md bg-background-200 ${className}`} style={style} />
  );
}

export function TableSkeleton({ rows = 5, cols = 5 }: { rows?: number; cols?: number }) {
  return (
    <div className="space-y-0">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 px-3 py-2.5 border-b border-background-200">
          {Array.from({ length: cols }).map((_, j) => (
            <Skeleton key={j} className={`h-4 ${j === 0 ? 'w-32' : j === 1 ? 'w-16' : 'w-20'}`} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function TreeSkeleton({ items = 6 }: { items?: number }) {
  return (
    <div className="space-y-1 px-3 py-2">
      {Array.from({ length: items }).map((_, i) => (
        <Skeleton key={i} className="h-6 w-full" style={{ maxWidth: `${100 - i * 10}%` }} />
      ))}
    </div>
  );
}
