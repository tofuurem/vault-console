import {
  cloneElement,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent,
  type KeyboardEvent,
  type MouseEvent,
  type ReactElement,
} from 'react';

interface TooltipTriggerProps {
  readonly 'aria-describedby'?: string;
  readonly onFocus?: (event: FocusEvent<HTMLElement>) => void;
  readonly onBlur?: (event: FocusEvent<HTMLElement>) => void;
  readonly onKeyDown?: (event: KeyboardEvent<HTMLElement>) => void;
}

interface TooltipProps {
  readonly content: string;
  readonly children: ReactElement<TooltipTriggerProps>;
  readonly position?: 'top' | 'bottom' | 'left' | 'right';
  readonly delay?: number;
}

export default function Tooltip({
  content,
  children,
  position = 'top',
  delay = 300,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const tooltipId = useId();
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const positionClasses = {
    top: '-top-2 -translate-y-full left-1/2 -translate-x-1/2',
    bottom: '-bottom-2 translate-y-full left-1/2 -translate-x-1/2',
    left: '-left-2 -translate-x-full top-1/2 -translate-y-1/2',
    right: '-right-2 translate-x-full top-1/2 -translate-y-1/2',
  };

  const hide = () => {
    clearTimeout(timeoutRef.current);
    setVisible(false);
  };
  const showFromPointer = (_event: MouseEvent<HTMLDivElement>) => {
    clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => setVisible(true), delay);
  };
  const describedBy = [
    children.props['aria-describedby'],
    visible ? tooltipId : undefined,
  ].filter(Boolean).join(' ') || undefined;
  const trigger = cloneElement(children, {
    'aria-describedby': describedBy,
    onFocus: (event: FocusEvent<HTMLElement>) => {
      children.props.onFocus?.(event);
      clearTimeout(timeoutRef.current);
      setVisible(true);
    },
    onBlur: (event: FocusEvent<HTMLElement>) => {
      children.props.onBlur?.(event);
      hide();
    },
    onKeyDown: (event: KeyboardEvent<HTMLElement>) => {
      children.props.onKeyDown?.(event);
      if (event.key === 'Escape') hide();
    },
  });

  useEffect(() => () => clearTimeout(timeoutRef.current), []);

  return (
    <div className="relative inline-flex" onMouseEnter={showFromPointer} onMouseLeave={hide}>
      {trigger}
      {visible && (
        <div
          id={tooltipId}
          role="tooltip"
          className={`pointer-events-none absolute z-50 whitespace-nowrap rounded-md bg-foreground-900 px-2 py-1 text-xs font-medium text-background-50 ${positionClasses[position]}`}
        >
          {content}
        </div>
      )}
    </div>
  );
}
