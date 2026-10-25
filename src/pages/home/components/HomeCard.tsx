import { useId, type ReactNode } from 'react';

export const HOME_FOCUS_RING = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400';

interface HomeCardProps {
  readonly title: string;
  readonly icon: string;
  readonly action?: ReactNode;
  readonly children: ReactNode;
  readonly className?: string;
}

export function HomeCard({ title, icon, action, children, className = '' }: HomeCardProps) {
  const headingId = useId();
  return (
    <section
      aria-labelledby={headingId}
      className={`min-w-0 rounded-lg border border-background-200 bg-background-50 ${className}`}
    >
      <header className="flex min-h-11 items-center justify-between gap-2 border-b border-background-200 px-4 py-2">
        <h2 id={headingId} className="flex items-center gap-2 text-xs font-semibold text-foreground-800">
          <i className={`${icon} text-sm text-foreground-400`} aria-hidden="true" />
          {title}
        </h2>
        {action}
      </header>
      <div className="p-4">{children}</div>
    </section>
  );
}

export interface DetailItem {
  readonly label: string;
  readonly value: ReactNode;
}

export function DetailList({ items }: { readonly items: readonly DetailItem[] }) {
  return (
    <dl className="grid grid-cols-[minmax(0,8rem)_minmax(0,1fr)] gap-x-4 gap-y-2 text-xs">
      {items.map((item) => (
        <div key={item.label} className="contents">
          <dt className="text-foreground-500">{item.label}</dt>
          <dd className="min-w-0 break-words text-foreground-800">{item.value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function StatusDot({ tone }: { readonly tone: 'success' | 'warning' | 'danger' | 'muted' }) {
  const color = {
    success: 'bg-success-500',
    warning: 'bg-warning-500',
    danger: 'bg-danger-500',
    muted: 'bg-foreground-300',
  }[tone];
  return <span className={`inline-block h-1.5 w-1.5 shrink-0 rounded-full ${color}`} aria-hidden="true" />;
}

export function EmptyNote({ icon, title, children }: {
  readonly icon: string;
  readonly title: string;
  readonly children: ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 text-xs">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background-200">
        <i className={`${icon} text-sm text-foreground-400`} aria-hidden="true" />
      </span>
      <div>
        <p className="font-medium text-foreground-700">{title}</p>
        <p className="mt-0.5 leading-5 text-foreground-500">{children}</p>
      </div>
    </div>
  );
}
