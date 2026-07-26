import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  type ReactNode,
} from 'react';

import { useDirtyWorkspaceGuard } from './useDirtyWorkspaceGuard';

export interface WorkspaceStep {
  readonly id: string;
  readonly label: string;
  readonly description?: string;
  readonly invalid?: boolean;
  readonly complete?: boolean;
}

interface AccessWorkspaceShellProps {
  readonly eyebrow: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly stateLabel?: string;
  readonly steps: readonly WorkspaceStep[];
  readonly activeStep: string;
  readonly onStepChange: (step: string) => void;
  readonly onClose: () => void;
  readonly dirty: boolean;
  readonly children: ReactNode;
  readonly footer?: ReactNode;
}

export interface AccessWorkspaceShellHandle {
  readonly allowNextNavigation: () => void;
}

const AccessWorkspaceShell = forwardRef<AccessWorkspaceShellHandle, AccessWorkspaceShellProps>(
function AccessWorkspaceShell({
  eyebrow,
  title,
  subtitle,
  stateLabel = 'Draft',
  steps,
  activeStep,
  onStepChange,
  onClose,
  dirty,
  children,
  footer,
}: AccessWorkspaceShellProps, ref) {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const navigation = useDirtyWorkspaceGuard(dirty);

  useImperativeHandle(ref, () => ({
    allowNextNavigation: navigation.allowNextNavigation,
  }), [navigation.allowNextNavigation]);

  useEffect(() => {
    headingRef.current?.focus();
  }, [title]);

  return (
    <section className="flex min-h-0 min-w-0 flex-1 flex-col bg-background-100/60">
      <header className="relative shrink-0 overflow-hidden border-b border-background-300 bg-background-50">
        <div
          aria-hidden="true"
          className="absolute inset-y-0 right-0 hidden w-[38%] opacity-50 sm:block"
          style={{
            backgroundImage:
              'linear-gradient(135deg, transparent 0 48%, color-mix(in oklch, var(--primary-500) 9%, transparent) 48% 49%, transparent 49% 100%)',
            backgroundSize: '18px 18px',
          }}
        />
        <div className="relative flex min-h-[72px] items-center justify-between gap-4 px-4 py-3 sm:px-5">
          <div className="flex min-w-0 items-center gap-3">
            <button
              type="button"
              aria-label="Close access editor"
              onClick={() => navigation.guard(onClose)}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-md border border-background-300 bg-background-50 text-foreground-500 transition-colors hover:border-background-400 hover:bg-background-100 hover:text-foreground-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:h-8 sm:w-8"
            >
              <i className="ri-arrow-left-line" aria-hidden="true" />
            </button>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.18em] text-primary-600">
                  {eyebrow}
                </p>
                <span className="inline-flex items-center gap-1 rounded-sm border border-warning-200 bg-warning-50 px-1.5 py-0.5 font-mono text-[8px] font-semibold uppercase tracking-[0.12em] text-warning-800">
                  <span className="h-1 w-1 rounded-full bg-warning-500" aria-hidden="true" />
                  {stateLabel}
                </span>
              </div>
              <h1
                ref={headingRef}
                tabIndex={-1}
                className="mt-0.5 truncate text-[15px] font-semibold tracking-tight text-foreground-950 focus:outline-none"
              >
                {title}
              </h1>
              {subtitle && (
                <p className="mt-0.5 truncate font-mono text-[9px] text-foreground-400">
                  {subtitle}
                </p>
              )}
            </div>
          </div>
          <div className="hidden items-center gap-2 rounded-md border border-background-200 bg-background-100/80 px-2.5 py-1.5 sm:flex">
            <i className="ri-lock-2-line text-xs text-foreground-400" aria-hidden="true" />
            <span className="font-mono text-[9px] text-foreground-500">
              Vault writes occur only after Review
            </span>
          </div>
        </div>
      </header>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col lg:flex-row">
        <nav
          aria-label={`${eyebrow} steps`}
          className="shrink-0 border-b border-background-300 bg-background-50 lg:w-[228px] lg:border-b-0 lg:border-r"
        >
          <ol className="flex overflow-x-auto p-2 lg:flex-col lg:gap-1 lg:p-3">
            {steps.map((step, index) => {
              const active = step.id === activeStep;
              return (
                <li key={step.id} className="shrink-0 lg:w-full">
                  <button
                    type="button"
                    aria-current={active ? 'step' : undefined}
                    aria-invalid={step.invalid || undefined}
                    onClick={() => onStepChange(step.id)}
                    className={`group relative flex min-h-12 w-full min-w-[150px] items-center gap-2.5 rounded-md px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 lg:min-w-0 ${
                      active
                        ? 'bg-foreground-950 text-background-50'
                        : 'text-foreground-600 hover:bg-background-100 hover:text-foreground-900'
                    }`}
                  >
                    <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-sm border font-mono text-[9px] font-semibold ${
                      active
                        ? 'border-background-50/20 bg-background-50/10 text-background-50'
                        : step.invalid
                          ? 'border-danger-300 bg-danger-50 text-danger-700'
                          : step.complete
                            ? 'border-success-200 bg-success-50 text-success-700'
                            : 'border-background-300 bg-background-50 text-foreground-400'
                    }`}>
                      {step.complete && !active
                        ? <i className="ri-check-line" aria-hidden="true" />
                        : String(index + 1).padStart(2, '0')}
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[11px] font-semibold">{step.label}</span>
                      {step.description && (
                        <span className={`mt-0.5 hidden truncate text-[9px] lg:block ${
                          active ? 'text-background-300' : 'text-foreground-400'
                        }`}>
                          {step.description}
                        </span>
                      )}
                    </span>
                    {step.invalid && (
                      <i className="ri-error-warning-line ml-auto text-xs text-danger-500" aria-hidden="true" />
                    )}
                  </button>
                </li>
              );
            })}
          </ol>
        </nav>

        <div className="min-h-0 min-w-0 flex-1 overflow-y-auto">
          <div className="mx-auto w-full max-w-[1180px] p-4 sm:p-6 lg:p-8">
            {children}
          </div>
        </div>
      </div>

      {footer && (
        <footer className="shrink-0 border-t border-background-300 bg-background-50 px-4 py-3 shadow-[0_-8px_24px_-20px_rgba(0,0,0,0.45)] sm:px-5">
          <div className="mx-auto flex max-w-[1400px] items-center justify-between gap-3">
            {footer}
          </div>
        </footer>
      )}
    </section>
  );
});

export default AccessWorkspaceShell;
