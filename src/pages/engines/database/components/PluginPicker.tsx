import { useState } from 'react';

import { Input } from '@/components/base/Input';
import { DATABASE_PLUGINS, databasePlugin } from '@/domain/engines/database/plugins';

interface PluginPickerProps {
  readonly value: string;
  readonly error?: string;
  readonly onChange: (pluginName: string) => void;
}

const OTHER = 'other';

/** Radio grid of the plugins that ship with Vault, plus a free-text field for custom plugins. */
export default function PluginPicker({ value, error, onChange }: PluginPickerProps) {
  const [custom, setCustom] = useState(() => !databasePlugin(value) && value !== '');
  const options = [...DATABASE_PLUGINS.map((plugin) => ({ id: plugin.id, label: plugin.label })), { id: OTHER, label: 'Other plugin' }];
  const selected = custom ? OTHER : value;
  return (
    <fieldset className="space-y-2">
      <legend className="mb-1.5 text-xs font-medium text-foreground-700">Database plugin</legend>
      <div role="radiogroup" aria-label="Database plugin" className="grid grid-cols-2 gap-1.5 xl:grid-cols-3">
        {options.map((option) => {
          const active = option.id === selected;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                if (option.id === OTHER) {
                  setCustom(true);
                  onChange('');
                } else {
                  setCustom(false);
                  onChange(option.id);
                }
              }}
              className={`flex min-h-11 items-center gap-2 rounded-md border px-2.5 py-1.5 text-left text-xs leading-4 transition-[border-color,background-color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-9 ${
                active
                  ? 'border-primary-400 bg-primary-50 font-semibold text-primary-800'
                  : 'border-background-300 bg-background-50 text-foreground-800 hover:border-background-400 hover:bg-background-100'
              }`}
            >
              <i className={`${option.id === OTHER ? 'ri-puzzle-line' : 'ri-database-2-line'} text-sm ${active ? 'text-primary-600' : 'text-foreground-500'}`} aria-hidden="true" />
              <span className="min-w-0">{option.label}</span>
            </button>
          );
        })}
      </div>
      {custom ? (
        <Input
          label="Plugin name"
          value={value}
          onChange={(event) => onChange(event.target.value)}
          placeholder="custom-database-plugin"
          hint="The name the plugin was registered with in Vault's plugin catalog."
          error={error}
          spellCheck={false}
          monospace
        />
      ) : (
        <p className="font-mono text-[11px] text-foreground-500">{value}</p>
      )}
    </fieldset>
  );
}
