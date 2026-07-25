import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from 'react';

import type { ShortcutCommand } from './shortcut';

export interface ShortcutContextValue {
  readonly commands: readonly ShortcutCommand[];
  readonly paletteOpen: boolean;
  openPalette(): void;
  closePalette(): void;
  register(commands: readonly ShortcutCommand[]): () => void;
}

export const ShortcutContext = createContext<ShortcutContextValue | null>(null);

export function useShortcuts(): ShortcutContextValue {
  const context = useContext(ShortcutContext);
  if (!context) throw new Error('useShortcuts must be used inside ShortcutProvider');
  return context;
}

export function useShortcutCommands(commands: readonly ShortcutCommand[]): void {
  const { register } = useShortcuts();
  const commandsRef = useRef(commands);
  commandsRef.current = commands;
  const signature = useMemo(() => commands.map((command) => [
    command.id,
    command.label,
    command.group,
    command.icon ?? '',
    command.shortcut ?? '',
    command.disabledReason ?? '',
    command.searchTieBreaker ?? 0,
    ...(command.keywords ?? []),
  ].join('\u001f')).join('\u001e'), [commands]);

  useEffect(() => register(commandsRef.current.map((command) => ({
    ...command,
    run: () => commandsRef.current.find((candidate) => candidate.id === command.id)?.run(),
  }))), [register, signature]);
}
