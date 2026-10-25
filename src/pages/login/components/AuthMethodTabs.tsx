import type { KeyboardEvent } from 'react';

export type AuthTab = 'token' | 'userpass';

const TABS: readonly (readonly [AuthTab, string])[] = [
  ['token', 'Token'],
  ['userpass', 'Username & password'],
];

interface AuthMethodTabsProps {
  readonly selected: AuthTab;
  readonly onSelect: (tab: AuthTab) => void;
}

export default function AuthMethodTabs({ selected, onSelect }: AuthMethodTabsProps) {
  const selectFromKeyboard = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextTab: AuthTab = event.key === 'ArrowLeft' || event.key === 'Home' ? 'token' : 'userpass';
    onSelect(nextTab);
    document.getElementById(`${nextTab}-tab`)?.focus();
  };
  return (
    <div role="tablist" aria-label="Authentication method" className="grid grid-cols-2 border-b border-background-200 bg-background-100/50 px-6 pt-2">
      {TABS.map(([tab, label]) => (
        <button
          key={tab}
          id={`${tab}-tab`}
          type="button"
          role="tab"
          aria-selected={selected === tab}
          aria-controls={`${tab}-panel`}
          tabIndex={selected === tab ? 0 : -1}
          onClick={() => onSelect(tab)}
          onKeyDown={selectFromKeyboard}
          className={`min-h-11 border-b-2 px-3 py-2 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400 sm:min-h-0 ${selected === tab ? 'border-primary-500 text-primary-700' : 'border-transparent text-foreground-500 hover:text-foreground-800'}`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
