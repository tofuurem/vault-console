import type { ReactNode } from 'react';

export function DeleteBlockedNotice({ reason }: { readonly reason: string }) {
  return (
    <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-[10px] leading-4 text-warning-800">
      Delete blocked: {reason}
    </div>
  );
}

interface DetailMetricsProps {
  readonly metrics: readonly (readonly [string, ReactNode])[];
  readonly valueSizeClassName: string;
}

export function DetailMetrics({
  metrics,
  valueSizeClassName,
}: DetailMetricsProps) {
  return (
    <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map(([label, value]) => (
        <div key={label} className="rounded-lg border border-background-300 bg-background-50 p-3">
          <p className="font-mono text-[10px] uppercase text-foreground-400">{label}</p>
          <p className={`mt-1 font-mono ${valueSizeClassName} font-semibold text-foreground-900`}>{value}</p>
        </div>
      ))}
    </section>
  );
}

interface DetailNoteProps {
  readonly label: string;
  readonly children: ReactNode;
}

export function DetailNote({ label, children }: DetailNoteProps) {
  return (
    <section className="rounded-lg border border-background-300 bg-background-50 p-4">
      <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-foreground-400">
        {label}
      </p>
      <p className="mt-2 text-xs leading-5 text-foreground-700">
        {children}
      </p>
    </section>
  );
}

interface DetailPanelProps {
  readonly title: string;
  readonly bodyClassName: string;
  readonly children: ReactNode;
}

export function DetailPanel({ title, bodyClassName, children }: DetailPanelProps) {
  return (
    <section className="rounded-lg border border-background-300 bg-background-50">
      <header className="border-b border-background-200 px-4 py-3">
        <h2 className="text-xs font-semibold text-foreground-900">{title}</h2>
      </header>
      <div className={bodyClassName}>
        {children}
      </div>
    </section>
  );
}

export function DetailEmptyRow({ children }: { readonly children: ReactNode }) {
  return <p className="px-4 py-8 text-center text-xs text-foreground-400">{children}</p>;
}
