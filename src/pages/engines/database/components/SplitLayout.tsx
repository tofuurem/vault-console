import type { ReactNode } from 'react';

interface SplitLayoutProps {
  readonly list: ReactNode;
  readonly detail: ReactNode;
  /** On narrow screens only one pane shows: the detail when this is true. */
  readonly detailOpen: boolean;
  readonly backLabel: string;
  readonly onBack: () => void;
}

/** List on the left, detail or editor on the right; stacked as two screens on mobile. */
export default function SplitLayout({ list, detail, detailOpen, backLabel, onBack }: SplitLayoutProps) {
  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(220px,300px)_minmax(0,1fr)] lg:items-start">
      <div className={detailOpen ? 'hidden lg:block' : undefined}>{list}</div>
      <div className={`min-w-0 ${detailOpen ? '' : 'hidden lg:block'}`}>
        {detailOpen && (
          <button
            type="button"
            onClick={onBack}
            className="mb-3 inline-flex min-h-11 items-center gap-1 rounded-md px-2 text-xs font-medium text-primary-700 hover:bg-primary-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 lg:hidden"
          >
            <i className="ri-arrow-left-s-line" aria-hidden="true" />
            {backLabel}
          </button>
        )}
        {detail}
      </div>
    </div>
  );
}
