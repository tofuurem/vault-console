import { useEffect, useRef, type RefObject } from 'react';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

// Nested dialogs (a drawer opened from a full-screen inspector) each install a
// document listener; only the most recently opened one may react to keys.
const openDialogs: symbol[] = [];

function isTopmost(token: symbol): boolean {
  return openDialogs[openDialogs.length - 1] === token;
}

function focusableElements(container: HTMLElement): readonly HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((element) => (
    element.getAttribute('aria-hidden') !== 'true'
  ));
}

export function useDialogFocus(
  active: boolean,
  containerRef: RefObject<HTMLElement | null>,
  onClose: () => void,
): void {
  const previousFocus = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!active || !containerRef.current) return;
    const container = containerRef.current;
    const token = Symbol('dialog');
    openDialogs.push(token);
    previousFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    (focusableElements(container)[0] ?? container).focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isTopmost(token)) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== 'Tab') return;
      const elements = focusableElements(container);
      if (elements.length === 0) {
        event.preventDefault();
        container.focus();
        return;
      }
      const first = elements[0];
      const last = elements[elements.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => {
      openDialogs.splice(openDialogs.indexOf(token), 1);
      document.removeEventListener('keydown', handleKeyDown);
      previousFocus.current?.focus();
      previousFocus.current = null;
    };
  }, [active, containerRef]);
}
