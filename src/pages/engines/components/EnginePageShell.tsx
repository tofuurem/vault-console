import { useState, type ReactNode } from 'react';

import Button from '@/components/base/Button';
import { engineIcon, engineLabel, type SecretEngine } from '@/domain/engines/engines';
import EngineSettingsDrawer from './EngineSettingsDrawer';

export interface EngineTab {
  readonly key: string;
  readonly label: string;
  readonly icon?: string;
  readonly count?: number;
}

interface EnginePageShellProps {
  readonly engine: SecretEngine;
  /** Optional section tabs; the shell renders them as links-like buttons. */
  readonly tabs?: readonly EngineTab[];
  readonly activeTab?: string;
  readonly onTabChange?: (key: string) => void;
  /** Extra header actions such as "Create role". */
  readonly actions?: ReactNode;
  readonly children: ReactNode;
}

/** Shared frame for every engine workspace: identity, settings, and section tabs. */
export default function EnginePageShell({
  engine,
  tabs,
  activeTab,
  onTabChange,
  actions,
  children,
}: EnginePageShellProps) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  return (
    <main id="main-content" tabIndex={-1} className="flex min-h-0 flex-1 flex-col bg-background-50">
      <header className="shrink-0 border-b border-background-200 px-4 pt-3 sm:px-5">
        <div className="flex flex-wrap items-start justify-between gap-3 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary-100 text-primary-700">
              <i className={`${engineIcon(engine.kind)} text-base`} aria-hidden="true" />
            </div>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h1 className="truncate font-mono text-sm font-semibold text-foreground-900">{engine.path}/</h1>
                <span className="rounded bg-background-200 px-1.5 py-0.5 text-[10px] font-medium text-foreground-700">
                  {engineLabel(engine)}
                </span>
              </div>
              <p className="mt-0.5 truncate text-xs text-foreground-500">
                {engine.description || 'No description'}
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-1.5">
            {actions}
            <Button size="sm" onClick={() => setSettingsOpen(true)} aria-label="Engine settings">
              <i className="ri-settings-3-line" aria-hidden="true" />
              <span className="hidden sm:inline">Settings</span>
            </Button>
          </div>
        </div>
        {tabs && tabs.length > 0 && (
          <nav aria-label={`${engine.path} sections`} className="-mb-px flex gap-1 overflow-x-auto">
            {tabs.map((tab) => {
              const active = tab.key === activeTab;
              return (
                <button
                  key={tab.key}
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => onTabChange?.(tab.key)}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:min-h-9 ${
                    active
                      ? 'border-primary-500 text-primary-700'
                      : 'border-transparent text-foreground-600 hover:text-foreground-900'
                  }`}
                >
                  {tab.icon && <i className={`${tab.icon} text-sm`} aria-hidden="true" />}
                  {tab.label}
                  {tab.count !== undefined && (
                    <span className="rounded bg-background-200 px-1 text-[10px] text-foreground-600">{tab.count}</span>
                  )}
                </button>
              );
            })}
          </nav>
        )}
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[1400px] p-4 sm:p-5">{children}</div>
      </div>
      <EngineSettingsDrawer engine={engine} open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </main>
  );
}
