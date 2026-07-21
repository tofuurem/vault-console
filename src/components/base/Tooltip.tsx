import { useState, useRef, useEffect, type ReactNode } from 'react';

interface TooltipProps {
  content: string;
  children: ReactNode;
  position?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
}

export default function Tooltip({ content, children, position = 'top', delay = 300 }: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const positionClasses = {
    top: '-top-2 -translate-y-full left-1/2 -translate-x-1/2',
    bottom: '-bottom-2 translate-y-full left-1/2 -translate-x-1/2',
    left: '-left-2 -translate-x-full top-1/2 -translate-y-1/2',
    right: '-right-2 translate-x-full top-1/2 -translate-y-1/2',
  };

  const show = () => {
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  };

  const hide = () => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  };

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <div className="relative inline-flex" onMouseEnter={show} onMouseLeave={hide}>
      {children}
      {visible && (
        <div
          className={`absolute z-50 px-2 py-1 text-xs font-medium whitespace-nowrap rounded-md pointer-events-none
            bg-foreground-900 text-background-50 ${positionClasses[position]}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
