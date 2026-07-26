import { useEffect, useId, useRef, useState, type ReactNode } from 'react';

import { useDialogFocus } from './useDialogFocus';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: string;
  side?: 'left' | 'right';
}

export default function Drawer({
  open,
  onClose,
  title,
  children,
  width = '640px',
  side = 'right',
}: DrawerProps) {
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
      <div aria-hidden="true" className={`absolute inset-0 bg-overlay/30 ${open ? 'modal-backdrop-enter' : ''}`} onClick={onClose} />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title ? titleId : undefined}
        aria-label={title ? undefined : 'Drawer'}
        tabIndex={-1}
        className={`absolute inset-y-0 flex h-[100dvh] flex-col bg-background-50 shadow-sm ${
          side === 'left'
            ? `left-0 border-r border-background-300 ${open ? 'drawer-enter-left' : 'drawer-exit-left'}`
            : `right-0 border-l border-background-300 ${open ? 'drawer-enter' : 'drawer-exit'}`
        }`}
        style={{
          width: `min(${width}, 100vw)`,
          paddingTop: 'env(safe-area-inset-top, 0px)',
          paddingBottom: 'env(safe-area-inset-bottom, 0px)',
        }}
      >
        {title && (
          <div className="flex min-h-12 shrink-0 items-center justify-between border-b border-background-200 px-4 py-2">
            <h3 id={titleId} className="text-sm font-semibold text-foreground-900">{title}</h3>
            <button type="button" aria-label="Close drawer" onClick={onClose} className="flex h-11 w-11 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
              <i className="ri-close-line" aria-hidden="true" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}
