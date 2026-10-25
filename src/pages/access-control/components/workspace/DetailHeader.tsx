import type {
  ReactNode,
  RefObject,
} from 'react';

import Button from '@/components/base/Button';

interface DetailHeaderProps {
  readonly backAriaLabel: string;
  readonly backLabel: string;
  readonly onBack: () => void;
  readonly iconClassName: string;
  readonly iconToneClassName: string;
  readonly headingRef: RefObject<HTMLHeadingElement | null>;
  readonly title: string;
  readonly badgeLabel: string;
  readonly badgeToneClassName: string;
  readonly subtitle: string;
  readonly deleteReason?: string;
  readonly onDelete: () => void;
  readonly children?: ReactNode;
}

export default function DetailHeader({
  backAriaLabel,
  backLabel,
  onBack,
  iconClassName,
  iconToneClassName,
  headingRef,
  title,
  badgeLabel,
  badgeToneClassName,
  subtitle,
  deleteReason,
  onDelete,
  children,
}: DetailHeaderProps) {
  return (
    <header className="shrink-0 border-b border-background-300 bg-background-50 px-4 py-3 sm:px-5">
      <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Button type="button" size="sm" onClick={onBack} aria-label={backAriaLabel}>
            <i className="ri-arrow-left-line" aria-hidden="true" />{` ${backLabel}`}
          </Button>
          <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border ${iconToneClassName}`}>
            <i className={iconClassName} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="truncate text-base font-semibold text-foreground-950 focus:outline-none"
              >
                {title}
              </h1>
              <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${badgeToneClassName}`}>
                {badgeLabel}
              </span>
            </div>
            <p className="truncate font-mono text-[10px] text-foreground-400">{subtitle}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {children}
          <Button
            type="button"
            size="sm"
            variant="danger"
            disabled={Boolean(deleteReason)}
            title={deleteReason}
            onClick={onDelete}
          >
            <i className="ri-delete-bin-6-line" aria-hidden="true" /> Delete
          </Button>
        </div>
      </div>
    </header>
  );
}
