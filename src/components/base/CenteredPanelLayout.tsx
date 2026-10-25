import type { ReactNode } from 'react';

interface CenteredPanelLayoutProps {
  readonly labelledBy: string;
  readonly children: ReactNode;
  readonly width?: 'md' | 'lg';
}

const WIDTHS = {
  md: 'max-w-[430px]',
  lg: 'max-w-[520px]',
} as const;

/** Full-height pre-session layout shared by sign-in and recovery screens. */
export default function CenteredPanelLayout({
  labelledBy,
  children,
  width = 'md',
}: CenteredPanelLayoutProps) {
  return (
    <main
      id="main-content"
      tabIndex={-1}
      className="relative flex h-full items-start justify-center overflow-auto bg-background-100 px-4 py-8 sm:items-center"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-50 [background-image:linear-gradient(to_right,oklch(var(--background-300)/.35)_1px,transparent_1px),linear-gradient(to_bottom,oklch(var(--background-300)/.35)_1px,transparent_1px)] [background-size:32px_32px]"
      />
      <section
        aria-labelledby={labelledBy}
        className={`relative w-full ${WIDTHS[width]} overflow-hidden rounded-xl border border-background-300 bg-background-50 shadow-xl shadow-overlay/10`}
      >
        {children}
      </section>
    </main>
  );
}
