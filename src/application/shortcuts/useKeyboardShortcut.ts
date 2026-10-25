import { useEffect, useRef } from 'react';

import { isPageShortcutEvent } from './shortcut';

/**
 * Listens for single-key page shortcuts such as `/` or `?`. The handler may
 * return `false` to leave the key to the browser (no `preventDefault`).
 * Works without `ShortcutProvider`, so isolated views can use it too.
 */
export function useKeyboardShortcut(
  keys: readonly string[],
  handler: (event: KeyboardEvent) => boolean | void,
  enabled = true,
): void {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const keySignature = keys.join('\u001f');

  useEffect(() => {
    if (!enabled) return;
    const accepted = new Set(keySignature.split('\u001f'));
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!accepted.has(event.key) || !isPageShortcutEvent(event)) return;
      if (handlerRef.current(event) === false) return;
      event.preventDefault();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [enabled, keySignature]);
}
