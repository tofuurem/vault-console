import { useEffect, useRef, useState } from 'react';

import { useToast } from '@/application/notifications/ToastContext';

/** Copies a value and remembers which control did it, for a brief "Copied" state. */
export function useCopy() {
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

/** Saves text as a file in the browser; nothing is uploaded or stored. */
export function downloadText(fileName: string, content: string): void {
  const url = URL.createObjectURL(new Blob([content.endsWith('\n') ? content : `${content}\n`], { type: 'text/plain' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

export type CopyState = ReturnType<typeof useCopy>;
