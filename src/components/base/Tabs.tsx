import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';

interface Tab {
  key: string;
  label: string;
  icon?: string;
  count?: number;
}

interface TabsProps {
  tabs: readonly Tab[];
  activeTab: string;
  onChange: (key: string) => void;
  children: ReactNode;
}

export default function Tabs({ tabs, activeTab, onChange, children }: TabsProps) {
  const [hoveredKey, setHoveredKey] = useState<string | null>(null);
  const id = useId();
  const selectAdjacent = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    const nextIndex = event.key === 'Home'
      ? 0
      : event.key === 'End'
        ? tabs.length - 1
        : (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    onChange(tabs[nextIndex].key);
    document.getElementById(`${id}-tab-${tabs[nextIndex].key}`)?.focus();
  };

  return (
    <div className="flex flex-col h-full">
      <div role="tablist" className="flex border-b border-background-200 shrink-0">
        {tabs.map((tab, index) => (
          <button
            key={tab.key}
            id={`${id}-tab-${tab.key}`}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.key}
            aria-controls={`${id}-panel`}
            tabIndex={activeTab === tab.key ? 0 : -1}
            onClick={() => onChange(tab.key)}
            onKeyDown={(event) => selectAdjacent(event, index)}
            onMouseEnter={() => setHoveredKey(tab.key)}
            onMouseLeave={() => setHoveredKey(null)}
            className={`relative flex items-center gap-1.5 px-3 py-2 text-xs font-medium whitespace-nowrap cursor-pointer transition-colors duration-100
              ${activeTab === tab.key
                ? 'text-primary-600'
                : 'text-foreground-500 hover:text-foreground-700'
              }`}
          >
            {tab.icon && <i className={`${tab.icon} text-sm`} aria-hidden="true" />}
            {tab.label}
            {tab.count !== undefined && (
              <span className="ml-1 px-1.5 py-0 text-[10px] rounded-full bg-background-200 text-foreground-600">
                {tab.count}
              </span>
            )}
            <span
              className={`absolute bottom-0 left-0 right-0 h-0.5 transition-colors duration-100 ${
                activeTab === tab.key
                  ? 'bg-primary-500'
                  : hoveredKey === tab.key
                  ? 'bg-background-300'
                  : 'bg-transparent'
              }`}
            />
          </button>
        ))}
      </div>
      <div
        id={`${id}-panel`}
        role="tabpanel"
        aria-labelledby={`${id}-tab-${activeTab}`}
        className="flex-1 overflow-y-auto"
      >
        {children}
      </div>
    </div>
  );
}
