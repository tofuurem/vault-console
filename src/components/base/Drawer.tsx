import { useState, useEffect, useCallback, type ReactNode } from 'react';

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: string;
}

export default function Drawer({ open, onClose, title, children, width = '640px' }: DrawerProps) {
  const [visible, setVisible] = useState(false);

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

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); },
    [onClose]
  );

  useEffect(() => {
    if (open) document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [open, handleKeyDown]);

  if (!visible) return null;

  return (
    <div className="fixed inset-0 z-[70]">
      <div className={`absolute inset-0 bg-black/30 ${open ? 'modal-backdrop-enter' : ''}`} onClick={onClose} />
      <div
        className={`absolute top-0 right-0 h-full bg-background-50 border-l border-background-300 shadow-sm flex flex-col ${open ? 'drawer-enter' : 'drawer-exit'}`}
        style={{ width }}
      >
        {title && (
          <div className="flex items-center justify-between px-5 py-3.5 border-b border-background-200 shrink-0">
            <h3 className="text-sm font-semibold text-foreground-900">{title}</h3>
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer">
              <i className="ri-close-line" />
            </button>
          </div>
        )}
        <div className="flex-1 overflow-y-auto">{children}</div>
      </div>
    </div>
  );
}