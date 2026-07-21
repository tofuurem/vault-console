import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { useDialogFocus } from './useDialogFocus';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: string;
}

export default function Drawer({ open, onClose, title, children, width = '640px' }: DrawerProps) {
  const [visible, setVisible] = useState(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useEffect(() => {
    if (open) {
      setVisible(true);
      document.body.style.overflow = 'hidden';
    } else {
      const t = setTimeout(() => setVisible(false), 200);
      document.body.style.overflow = '';
      return () => clearTimeout(t);
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  useDialogFocus(open && visible, dialogRef, onClose);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <div aria-hidden="true" className={`absolute inset-0 bg-black/30 ${open ? 'modal-backdrop-enter' : ''}`} onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Drawer'}
        tabIndex={-1}
        className={`absolute top-0 right-0 h-full bg-background-50 border-l border-background-300 shadow-sm flex flex-col ${open ? 'drawer-enter' : 'drawer-exit'}`}
        style={{ width: `min(${width}, 100vw)` }}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-background-200 shrink-0">
            <h3 id={titleId} className="text-sm font-semibold text-foreground-900">{title}</h3>
            <button type="button" aria-label="Close drawer" onClick={onClose} className="w-7 h-7 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
              <i className="ri-close-line" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
