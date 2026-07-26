import { useEffect, useMemo, useState } from 'react';

interface PathBreadcrumbsProps {
  readonly mount: string;
  readonly currentPath: string;
  readonly onNavigate: (path: string) => void;
}

interface Breadcrumb {
  readonly label: string;
  readonly path: string;
}

const MAX_VISIBLE_SEGMENTS = 4;

function breadcrumbsFromPath(currentPath: string): readonly Breadcrumb[] {
  return currentPath.split('/').filter(Boolean).map((part, index, parts) => ({
    label: part,
    path: `${parts.slice(0, index + 1).join('/')}/`,
  }));
}

export default function PathBreadcrumbs({
  mount,
  currentPath,
  onNavigate,
}: PathBreadcrumbsProps) {
  const [expanded, setExpanded] = useState(false);
  const breadcrumbs = useMemo(
    () => breadcrumbsFromPath(currentPath),
    [currentPath],
  );
  const hasCollapsedMiddle = breadcrumbs.length > MAX_VISIBLE_SEGMENTS;
  const hiddenCount = Math.max(0, breadcrumbs.length - 3);
  const visible = hasCollapsedMiddle && !expanded
    ? [breadcrumbs[0], ...breadcrumbs.slice(-2)]
    : breadcrumbs;

  useEffect(() => {
    setExpanded(false);
  }, [currentPath]);

  return (
    <nav
      aria-label="Secret path"
      className="mb-2 flex min-w-0 items-center gap-1.5 overflow-x-auto whitespace-nowrap pb-0.5 text-xs"
    >
      <button
        type="button"
        onClick={() => onNavigate('')}
        className="min-h-11 shrink-0 rounded-sm font-mono text-foreground-500 hover:text-primary-600 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-7"
      >
        {mount}/
      </button>
      {visible.map((crumb, index) => {
        const originalIndex = breadcrumbs.findIndex(
          (candidate) => candidate.path === crumb.path,
        );
        const showCollapseControl = hasCollapsedMiddle
          && !expanded
          && index === 1;
        const last = originalIndex === breadcrumbs.length - 1;
        return (
          <span key={crumb.path} className="flex shrink-0 items-center gap-1.5">
            {showCollapseControl && (
              <>
                <span className="text-foreground-300">/</span>
                <button
                  type="button"
                  aria-label={`Show ${hiddenCount} hidden path segments`}
                  aria-expanded={false}
                  onClick={() => setExpanded(true)}
                  className="flex min-h-11 min-w-11 items-center justify-center rounded-md font-mono text-foreground-500 hover:bg-background-100 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-7 sm:min-w-7"
                >
                  …
                </button>
              </>
            )}
            <span className="text-foreground-300">/</span>
            <button
              type="button"
              onClick={() => onNavigate(crumb.path)}
              title={crumb.label}
              className={`min-h-11 max-w-44 truncate rounded-sm font-mono focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-7 ${
                last
                  ? 'font-medium text-foreground-900'
                  : 'text-foreground-500 hover:text-primary-600'
              }`}
            >
              {crumb.label}/
            </button>
          </span>
        );
      })}
      {hasCollapsedMiddle && expanded && (
        <button
          type="button"
          aria-label="Collapse middle path segments"
          aria-expanded={true}
          onClick={() => setExpanded(false)}
          className="flex min-h-11 shrink-0 items-center gap-1 rounded-md px-1.5 text-[10px] font-medium text-foreground-500 hover:bg-background-100 hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-7"
        >
          <i className="ri-contract-left-right-line" aria-hidden="true" />
          Collapse
        </button>
      )}
    </nav>
  );
}
