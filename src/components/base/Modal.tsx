import { useState, useEffect, useCallback, type ReactNode } from 'react';

interface ModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
}

export default function Modal({ open, onClose, title, children, width = 'md' }: ModalProps) {
  const [visible, setVisible] = useState(false);

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
    <div className="fixed inset-0 z-[60] flex items-center justify-center">
      <div className={`absolute inset-0 bg-black/40 ${open ? 'modal-backdrop-enter' : ''}`} onClick={onClose} />
      <div className={`relative w-full ${widths[width]} mx-4 max-h-[85vh] overflow-hidden rounded-lg bg-background-50 border border-background-300 ${open ? 'modal-content-enter' : ''}`}>
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-background-200">
            <h3 className="text-sm font-semibold text-foreground-900">{title}</h3>
            <button onClick={onClose} className="w-6 h-6 flex items-center justify-center rounded-md text-foreground-400 hover:text-foreground-700 hover:bg-background-100 cursor-pointer">
              <i className="ri-close-line" />
            </button>
          </div>
        )}
        <div className="overflow-y-auto max-h-[calc(85vh-48px)]">{children}</div>
      </div>
    </div>
  );
}