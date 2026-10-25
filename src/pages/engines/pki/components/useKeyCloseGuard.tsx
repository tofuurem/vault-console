import { useState, type ReactNode } from 'react';

import { useConfirmDialog } from '@/components/base/useConfirmDialog';

/**
 * Asks before closing a view that shows a one-time private key the operator
 * has not copied or downloaded yet.
 */
export function useKeyCloseGuard(hasUnsavedKey: boolean): {
  readonly markSaved: () => void;
  readonly reset: () => void;
  readonly confirmClose: () => Promise<boolean>;
  readonly dialog: ReactNode;
} {
  const [saved, setSaved] = useState(false);
  const [confirm, dialog] = useConfirmDialog();
  return {
    markSaved: () => setSaved(true),
    reset: () => setSaved(false),
    confirmClose: async () => {
      if (!hasUnsavedKey || saved) return true;
      return confirm({
        title: 'Close without saving the key',
        message: 'The private key has not been copied or downloaded. Once this closes, nobody can show it again.',
        confirmLabel: 'Close anyway',
        cancelLabel: 'Keep open',
      });
    },
    dialog,
  };
}
