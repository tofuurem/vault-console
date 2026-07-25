import { Suspense, type ReactNode } from 'react';

export default function LazyRoute({
  children,
}: {
  readonly children: ReactNode;
}) {
  return (
    <Suspense
      fallback={(
        <main
          id="main-content"
          aria-busy="true"
          className="flex min-h-0 flex-1 items-center justify-center bg-background-50"
        >
          <div className="flex items-center gap-2 text-xs text-foreground-500">
            <i className="ri-loader-4-line animate-spin text-primary-500" aria-hidden="true" />
            Loading workspace…
          </div>
        </main>
      )}
    >
      {children}
    </Suspense>
  );
}
