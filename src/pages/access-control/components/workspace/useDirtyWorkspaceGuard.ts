import {
  useCallback,
  useEffect,
} from 'react';

export function useDirtyWorkspaceGuard(
  dirty: boolean,
  message = 'Discard unsaved access changes?',
): (action: () => void) => void {
  useEffect(() => {
    if (!dirty) return undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  return useCallback((action: () => void) => {
    if (!dirty || window.confirm(message)) action();
  }, [dirty, message]);
}
