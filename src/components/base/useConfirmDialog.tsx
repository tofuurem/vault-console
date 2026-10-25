import { useCallback, useRef, useState, type ReactNode } from 'react';

import Button from './Button';
import Modal from './Modal';

export interface ConfirmOptions {
  readonly title: string;
  readonly message: string;
  readonly confirmLabel: string;
  readonly cancelLabel?: string;
}

/**
 * In-app replacement for window.confirm: styled like the rest of the console,
 * keyboard-trapped, and dismissible with Escape (which counts as cancel).
 */
export function useConfirmDialog(): readonly [(options: ConfirmOptions) => Promise<boolean>, ReactNode] {
  const [options, setOptions] = useState<ConfirmOptions>();
  const resolveRef = useRef<((confirmed: boolean) => void) | null>(null);

  const settle = useCallback((confirmed: boolean) => {
    resolveRef.current?.(confirmed);
    resolveRef.current = null;
    setOptions(undefined);
  }, []);

  const confirm = useCallback((next: ConfirmOptions) => {
    resolveRef.current?.(false);
    setOptions(next);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
    });
  }, []);

  const dialog = (
    <Modal open={Boolean(options)} onClose={() => settle(false)} title={options?.title} width="sm">
      <div className="space-y-4 p-4">
        <p className="text-xs leading-5 text-foreground-700">{options?.message}</p>
        <div className="flex justify-end gap-2">
          <Button type="button" size="sm" onClick={() => settle(false)}>
            {options?.cancelLabel ?? 'Cancel'}
          </Button>
          <Button type="button" size="sm" variant="danger" onClick={() => settle(true)}>
            {options?.confirmLabel}
          </Button>
        </div>
      </div>
    </Modal>
  );

  return [confirm, dialog] as const;
}
