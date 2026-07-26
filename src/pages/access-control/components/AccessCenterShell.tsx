import type { ReactNode } from 'react';

const SECTIONS = [
  { key: 'users', label: 'Users', icon: 'ri-user-settings-line' },
  { key: 'groups', label: 'Groups', icon: 'ri-group-line' },
  { key: 'roles', label: 'Roles', icon: 'ri-shield-check-line' },
  { key: 'policies', label: 'Policies', icon: 'ri-file-code-line' },
] as const;

interface AccessCenterShellProps {
  readonly activeSection: string;
  readonly onSectionSelect: (section: string) => void;
  readonly children: ReactNode;
}

export default function AccessCenterShell({
  activeSection,
  onSectionSelect,
  children,
}: AccessCenterShellProps) {
  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background-50">
      <header className="shrink-0 border-b border-background-200 bg-background-50">
        <div className="px-4 pt-3 sm:px-5">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
            Identity &amp; ACL
          </p>
          <h1 className="mt-0.5 text-[15px] font-semibold tracking-tight text-foreground-900">
            Access Center
          </h1>
        </div>
        <nav
          aria-label="Access Center sections"
          className="mt-2 flex max-w-full gap-0.5 overflow-x-auto px-2 sm:px-3"
        >
          {SECTIONS.map((section) => {
            const active = activeSection === section.key;
            return (
              <button
                key={section.key}
                type="button"
                aria-current={active ? 'page' : undefined}
                onClick={() => onSectionSelect(section.key)}
                className={`relative flex min-h-11 shrink-0 items-center gap-1.5 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:min-h-9 ${
                  active
                    ? 'text-primary-700'
                    : 'text-foreground-500 hover:text-foreground-800'
                }`}
              >
                <i className={`${section.icon} text-sm`} aria-hidden="true" />
                {section.label}
                <span
                  className={`absolute inset-x-2 bottom-0 h-0.5 rounded-t ${
                    active ? 'bg-primary-500' : 'bg-transparent'
                  }`}
                  aria-hidden="true"
                />
              </button>
            );
          })}
        </nav>
      </header>
      <div className="flex min-h-0 flex-1">{children}</div>
    </section>
  );
}
