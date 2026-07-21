import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { useDialogFocus } from './useDialogFocus';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function Modal({ open, onClose, title, children, width = 'md' }: ModalProps) {
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  const widths = { sm: 'max-w-sm', md: 'max-w-lg', lg: 'max-w-2xl', xl: 'max-w-4xl' };

  useEffect(() => {
    if (open) {
      setVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      const t = setTimeout(() => setVisible(false), 150);
      document.body.style.overflow = '';
      return () => clearTimeout(t);
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useDialogFocus(open && visible, dialogRef, onClose);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div aria-hidden="true" className={`absolute inset-0 bg-black/40 ${open ? 'modal-backdrop-enter' : ''}`} onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Dialog'}
        tabIndex={-1}
        className={`relative mx-3 max-h-[calc(100dvh-24px)] w-full ${widths[width]} overflow-hidden rounded-lg border border-background-300 bg-background-50 shadow-sm sm:mx-4 sm:max-h-[85vh] ${open ? 'modal-content-enter' : ''}`}
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-background-200">
            <h3 id={titleId} className="text-sm font-semibold text-foreground-900">{title}</h3>
            <button type="button" aria-label="Close dialog" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
              <i className="ri-close-line" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="max-h-[calc(100dvh-72px)] overflow-y-auto sm:max-h-[calc(85vh-48px)]">{children}</div>
      </div>
    </div>
  );
}
