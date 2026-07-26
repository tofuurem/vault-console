import {
  useEffect,
  useId,
  useMemo,
  useState,
  type KeyboardEvent,
} from 'react';

import { useShortcuts } from '@/application/shortcuts/ShortcutContext';
import {
  rankShortcutCommands,
  type ShortcutCommand,
} from '@/application/shortcuts/shortcut';
import Modal from '@/components/base/Modal';

const MAX_VISIBLE_COMMANDS = 100;

function nextEnabledIndex(
  commands: readonly ShortcutCommand[],
  current: number,
  direction: 1 | -1,
): number {
  if (commands.length === 0) return -1;
  for (let offset = 1; offset <= commands.length; offset += 1) {
    const index = (current + direction * offset + commands.length) % commands.length;
    if (!commands[index].disabledReason) return index;
  }
  return -1;
}

export default function CommandPalette() {
  const shortcuts = useShortcuts();
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const listboxId = useId();
  const rankedCommands = useMemo(
    () => rankShortcutCommands(shortcuts.commands, query),
    [query, shortcuts.commands],
  );
  const commands = useMemo(
    () => rankedCommands.slice(0, MAX_VISIBLE_COMMANDS),
    [rankedCommands],
  );

  useEffect(() => {
    if (!shortcuts.paletteOpen) return;
    setQuery('');
    setActiveIndex(0);
  }, [shortcuts.paletteOpen]);

  useEffect(() => {
    setActiveIndex(nextEnabledIndex(commands, -1, 1));
  }, [commands]);

  const run = (command: ShortcutCommand) => {
    if (command.disabledReason) return;
    shortcuts.closePalette();
    command.run();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      setActiveIndex((current) => nextEnabledIndex(
        commands,
        current,
        event.key === 'ArrowDown' ? 1 : -1,
      ));
      return;
    }
    if (event.key === 'Home' || event.key === 'End') {
      event.preventDefault();
      setActiveIndex(nextEnabledIndex(
        commands,
        event.key === 'Home' ? -1 : 0,
        event.key === 'Home' ? 1 : -1,
      ));
      return;
    }
    if (event.key === 'Enter' && activeIndex >= 0) {
      event.preventDefault();
      const command = commands[activeIndex];
      if (command) run(command);
    }
  };

  return (
    <Modal
      open={shortcuts.paletteOpen}
      onClose={shortcuts.closePalette}
      ariaLabel="Command palette"
      width="lg"
    >
      <div className="border-b border-background-200 p-3">
        <div className="flex items-center gap-2 rounded-md border border-background-300 bg-background-100 px-3 focus-within:border-primary-400 focus-within:ring-2 focus-within:ring-primary-200">
          <i className="ri-search-line text-sm text-foreground-400" aria-hidden="true" />
          <input
            type="search"
            role="combobox"
            aria-label="Search commands"
            aria-controls={listboxId}
            aria-expanded="true"
            aria-autocomplete="list"
            aria-activedescendant={activeIndex >= 0 ? `${listboxId}-${activeIndex}` : undefined}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Go to a mount, user, setting, or action…"
            autoComplete="off"
            spellCheck={false}
            className="h-11 min-w-0 flex-1 bg-transparent text-sm text-foreground-900 outline-none placeholder:text-foreground-400 sm:h-10"
          />
          <kbd className="rounded border border-background-300 bg-background-50 px-1.5 py-0.5 font-mono text-[9px] text-foreground-400">
            Esc
          </kbd>
        </div>
      </div>

      <div
        id={listboxId}
        role="listbox"
        aria-label="Commands"
        className="max-h-[min(460px,60dvh)] overflow-y-auto p-1.5"
      >
        {commands.length === 0 ? (
          <div className="px-3 py-10 text-center">
            <i className="ri-search-eye-line text-xl text-foreground-300" aria-hidden="true" />
            <p className="mt-2 text-xs font-medium text-foreground-700">No matching commands</p>
            <p className="mt-1 text-[11px] text-foreground-400">Try a mount name, path, or section.</p>
          </div>
        ) : (
          <>
            {commands.map((command, index) => (
              <button
                key={command.id}
                id={`${listboxId}-${index}`}
                type="button"
                role="option"
                aria-selected={activeIndex === index}
                aria-disabled={command.disabledReason ? 'true' : undefined}
                onMouseMove={() => {
                  if (!command.disabledReason) setActiveIndex(index);
                }}
                onClick={() => run(command)}
                className={`grid min-h-11 w-full grid-cols-[28px_minmax(0,1fr)_auto] items-center gap-2 rounded-md px-2.5 py-1.5 text-left transition-colors ${
                  command.disabledReason
                    ? 'cursor-not-allowed text-foreground-400'
                    : activeIndex === index
                      ? 'bg-primary-100 text-primary-800'
                      : 'text-foreground-700 hover:bg-background-100'
                }`}
              >
                <i className={`${command.icon ?? 'ri-terminal-box-line'} text-sm`} aria-hidden="true" />
                <span className="min-w-0">
                  <span className="block truncate text-xs font-medium">{command.label}</span>
                  <span className="block truncate text-[10px] text-foreground-400">
                    {command.disabledReason ?? command.group}
                  </span>
                </span>
                {command.shortcut && (
                  <kbd className="rounded border border-background-300 bg-background-50 px-1.5 py-0.5 font-mono text-[9px] text-foreground-400">
                    {command.shortcut}
                  </kbd>
                )}
              </button>
            ))}
            {rankedCommands.length > commands.length && (
              <p className="px-3 py-2 text-center text-[10px] text-foreground-400">
                Showing the first {commands.length} of {rankedCommands.length} matches. Refine your search.
              </p>
            )}
          </>
        )}
      </div>
    </Modal>
  );
}
