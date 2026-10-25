import { useCallback, useContext, useEffect, useRef, useState } from 'react';

import { ToastContext } from '@/application/notifications/ToastContext';

export interface InspectorClipboard {
  /** Non-sensitive confirmation of the last copy, cleared after a moment. */
  readonly status: string;
  readonly succeeded: boolean;
  /** Toasts announce feedback when available; otherwise render `status` in a live region. */
  readonly announcesWithToast: boolean;
  /**
   * `produce` runs only inside the explicit copy action so revealed values go
   * straight to the Clipboard API and never into state, markup, or toasts.
   */
  copy(produce: () => string, successMessage: string): Promise<void>;
}

const FAILURE_MESSAGE = 'The browser clipboard is unavailable.';

export function useInspectorClipboard(): InspectorClipboard {
  const toast = useContext(ToastContext);
  const [status, setStatus] = useState('');
  const [succeeded, setSucceeded] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (timerRef.current) clearTimeout(timerRef.current);
  }, []);

  const copy = useCallback(async (produce: () => string, successMessage: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    try {
      await navigator.clipboard.writeText(produce());
      setStatus(successMessage);
      setSucceeded(true);
      toast?.success(successMessage);
    } catch {
      setStatus(`Copy failed. ${FAILURE_MESSAGE}`);
      setSucceeded(false);
      toast?.error(FAILURE_MESSAGE, { title: 'Copy failed' });
    }
    timerRef.current = setTimeout(() => {
      setStatus('');
      setSucceeded(false);
    }, 2_000);
  }, [toast]);

  return { status, succeeded, announcesWithToast: toast !== null, copy };
}
