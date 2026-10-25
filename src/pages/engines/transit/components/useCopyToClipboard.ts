import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/application/notifications/ToastContext';

/** Copies a value and remembers which control did it, for a brief "Copied" state. */
export function useCopyToClipboard() {
  const toast = useToast();
  const [copied, setCopied] = useState<string>();
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => () => clearTimeout(timer.current), []);
  const copy = async (id: string, value: string) => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      clearTimeout(timer.current);
      timer.current = setTimeout(() => setCopied(undefined), 2000);
    } catch {
      toast.error('The browser did not allow copying. Select the text and copy it manually.', { title: 'Copy failed' });
    }
  };
  return { copied, copy } as const;
}
