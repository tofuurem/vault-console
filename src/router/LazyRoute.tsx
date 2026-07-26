import { Suspense, type ReactNode } from 'react';
import ContentSkeleton from '@/components/base/ContentSkeleton';

export default function LazyRoute({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <Suspense
      fallback={(
        <main id="main-content" aria-busy="true" className="flex min-h-0 flex-1 bg-background-50">
          <ContentSkeleton label="Loading workspace" />
        </main>
      )}
    >
      {children}
    </Suspense>
  );
}
