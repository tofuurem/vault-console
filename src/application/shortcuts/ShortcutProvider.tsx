import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ShortcutContext, type ShortcutContextValue } from './ShortcutContext';
import { isPaletteShortcut, type ShortcutCommand } from './shortcut';

interface ShortcutProviderProps {
  readonly children: ReactNode;
}

interface RegisteredCommand {
  readonly owner: number;
  readonly command: ShortcutCommand;
}

export function ShortcutProvider({ children }: ShortcutProviderProps) {
  const nextOwner = useRef(0);
  const [registry, setRegistry] = useState<ReadonlyMap<string, RegisteredCommand>>(
    () => new Map(),
  );
  const [paletteOpen, setPaletteOpen] = useState(false);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);
  const register = useCallback((commands: readonly ShortcutCommand[]) => {
    nextOwner.current += 1;
    const owner = nextOwner.current;
    setRegistry((current) => {
      const next = new Map(current);
      for (const command of commands) next.set(command.id, { owner, command });
      return next;
    });
    return () => {
      setRegistry((current) => {
        const next = new Map(current);
        for (const command of commands) {
          if (next.get(command.id)?.owner === owner) next.delete(command.id);
        }
        return next;
      });
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isPaletteShortcut(event)) return;
      event.preventDefault();
      setPaletteOpen((current) => !current);
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, []);

  const commands = useMemo(
    () => [...registry.values()].map(({ command }) => command),
    [registry],
  );
  const value = useMemo<ShortcutContextValue>(() => ({
    commands,
    paletteOpen,
    openPalette,
    closePalette,
    register,
  }), [closePalette, commands, openPalette, paletteOpen, register]);

  return <ShortcutContext.Provider value={value}>{children}</ShortcutContext.Provider>;
}
