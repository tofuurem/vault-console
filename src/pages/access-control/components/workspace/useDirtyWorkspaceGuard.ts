import {
  useCallback,
  useEffect,
  useRef,
  type ReactNode,
} from 'react';
import { useBlocker, type BlockerFunction } from 'react-router-dom';

import { useConfirmDialog, type ConfirmOptions } from '@/components/base/useConfirmDialog';

export interface DirtyWorkspaceGuard {
  readonly guard: (action: () => void) => void;
  readonly allowNextNavigation: () => void;
  /** Must be rendered by the workspace so the discard prompt can appear. */
  readonly dialog: ReactNode;
}

const DISCARD_PROMPT: ConfirmOptions = {
  title: 'Discard unsaved changes?',
  message: 'Your access changes have not been applied to Vault and will be lost.',
  confirmLabel: 'Discard changes',
  cancelLabel: 'Keep editing',
};

export function useDirtyWorkspaceGuard(dirty: boolean): DirtyWorkspaceGuard {
  const [confirm, dialog] = useConfirmDialog();
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
    void confirm(DISCARD_PROMPT).then((discard) => {
      if (discard) blocker.proceed();
      else blocker.reset();
    });
  }, [blocker, confirm]);

  const guard = useCallback((action: () => void) => {
    if (!dirty) {
      action();
      return;
    }
    void confirm(DISCARD_PROMPT).then((discard) => {
      if (!discard) return;
      bypassNextNavigation.current = true;
      action();
    });
  }, [confirm, dirty]);
  const allowNextNavigation = useCallback(() => {
    bypassNextNavigation.current = true;
  }, []);
  return { guard, allowNextNavigation, dialog };
}
