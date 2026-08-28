import {
  useCallback,
  useEffect,
  useRef,
} from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';

export interface DirtyWorkspaceGuard {
  readonly guard: (action: () => void) => void;
  readonly allowNextNavigation: () => void;
}

export function useDirtyWorkspaceGuard(
  dirty: boolean,
  message = 'Discard unsaved access changes?',
): DirtyWorkspaceGuard {
  const bypassNextNavigation = useRef(false);
  const blocker = useBlocker(useCallback<BlockerFunction>(({
    currentLocation,
    nextLocation,
  }) => {
    if (bypassNextNavigation.current) {
      bypassNextNavigation.current = false;
      return false;
    }
    return dirty && (
      currentLocation.pathname !== nextLocation.pathname
      || currentLocation.search !== nextLocation.search
      || currentLocation.hash !== nextLocation.hash
    );
  }, [dirty]));

  useEffect(() => {
    if (!dirty) return undefined;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (blocker.state !== 'blocked') return;
    if (window.confirm(message)) blocker.proceed();
    else blocker.reset();
  }, [blocker, message]);

  const guard = useCallback((action: () => void) => {
    if (!dirty) {
      action();
      return;
    }
    if (window.confirm(message)) {
      bypassNextNavigation.current = true;
      action();
    }
  }, [dirty, message]);
  const allowNextNavigation = useCallback(() => {
    bypassNextNavigation.current = true;
  }, []);
  return { guard, allowNextNavigation };
}
