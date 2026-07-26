import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FocusEvent,
} from 'react';
import { createPortal } from 'react-dom';

import type { ToastKind, ToastRecord } from '@/application/notifications/toast';

interface ToastViewportProps {
  readonly toasts: readonly ToastRecord[];
  readonly onDismiss: (id: string) => void;
  readonly onAction: (id: string) => void;
}

interface ToastItemProps {
  readonly toast: ToastRecord;
  readonly onDismiss: (id: string) => void;
  readonly onAction: (id: string) => void;
}

const APPEARANCE: Readonly<Record<ToastKind, {
  readonly icon: string;
  readonly accent: string;
  readonly iconSurface: string;
}>> = {
  success: {
    icon: 'ri-checkbox-circle-fill',
    accent: 'text-success-700',
    iconSurface: 'bg-success-100',
  },
  info: {
    icon: 'ri-information-fill',
    accent: 'text-primary-700',
    iconSurface: 'bg-primary-100',
  },
  warning: {
    icon: 'ri-alert-fill',
    accent: 'text-warning-700',
    iconSurface: 'bg-warning-100',
  },
  error: {
    icon: 'ri-error-warning-fill',
    accent: 'text-danger-700',
    iconSurface: 'bg-danger-100',
  },
  action: {
    icon: 'ri-history-line',
    accent: 'text-primary-700',
    iconSurface: 'bg-primary-100',
  },
};

function ToastItem({ toast, onDismiss, onAction }: ToastItemProps) {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const startedAt = useRef(0);
  const remaining = useRef(toast.durationMs ?? 0);
  const actionRun = useRef(false);
  const [paused, setPaused] = useState(false);
  const appearance = APPEARANCE[toast.kind];

  const clearTimer = useCallback(() => {
    if (timer.current === undefined) return;
    clearTimeout(timer.current);
    timer.current = undefined;
  }, []);

  const pause = useCallback(() => {
    if (toast.durationMs === null || paused) return;
    clearTimer();
    remaining.current = Math.max(0, remaining.current - (Date.now() - startedAt.current));
    setPaused(true);
  }, [clearTimer, paused, toast.durationMs]);

  const resume = useCallback(() => {
    if (toast.durationMs === null || !paused) return;
    setPaused(false);
  }, [paused, toast.durationMs]);

  useEffect(() => {
    if (toast.durationMs === null || paused) return;
    startedAt.current = Date.now();
    timer.current = setTimeout(() => onDismiss(toast.id), remaining.current);
    return clearTimer;
  }, [clearTimer, onDismiss, paused, toast.durationMs, toast.id]);

  const handleBlur = (event: FocusEvent<HTMLElement>) => {
    if (event.currentTarget.contains(event.relatedTarget)) return;
    resume();
  };

  return (
    <article
      role={toast.kind === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      onMouseEnter={pause}
      onMouseLeave={resume}
      onFocusCapture={pause}
      onBlurCapture={handleBlur}
      className="pointer-events-auto grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-2.5 rounded-lg border border-background-300 bg-background-50 px-3 py-2.5 shadow-lg shadow-overlay/15"
    >
      <span className={`mt-0.5 flex h-6 w-6 items-center justify-center rounded-md ${appearance.iconSurface} ${appearance.accent}`}>
        <i className={`${appearance.icon} text-sm`} aria-hidden="true" />
      </span>
      <div className="min-w-0">
        {toast.title && (
          <p className="text-xs font-semibold leading-5 text-foreground-900">{toast.title}</p>
        )}
        <p className="break-words text-xs leading-5 text-foreground-700">{toast.message}</p>
        {toast.action && (
          <button
            type="button"
            onClick={() => {
              if (actionRun.current) return;
              actionRun.current = true;
              onAction(toast.id);
            }}
            className="mt-1 min-h-11 rounded px-1 text-xs font-semibold text-primary-700 underline decoration-primary-300 underline-offset-2 hover:text-primary-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-0"
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button
        type="button"
        aria-label={`Dismiss ${toast.message} notification`}
        onClick={() => onDismiss(toast.id)}
        className="flex h-11 w-11 items-center justify-center rounded text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:h-6 sm:w-6"
      >
        <i className="ri-close-line text-sm" aria-hidden="true" />
      </button>
    </article>
  );
}

export default function ToastViewport({
  toasts,
  onDismiss,
  onAction,
}: ToastViewportProps) {
  if (toasts.length === 0) return null;

  const politeToasts = toasts.filter((toast) => toast.kind !== 'error');
  const assertiveToasts = toasts.filter((toast) => toast.kind === 'error');

  return createPortal(
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-3 bottom-3 z-[100] flex max-h-[calc(100dvh-24px)] flex-col-reverse gap-2 sm:inset-x-auto sm:bottom-4 sm:right-4 sm:w-[360px]"
    >
      <div aria-live="polite" aria-relevant="additions" className="contents">
        {politeToasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={onDismiss}
            onAction={onAction}
          />
        ))}
      </div>
      <div aria-live="assertive" aria-relevant="additions" className="contents">
        {assertiveToasts.map((toast) => (
          <ToastItem
            key={toast.id}
            toast={toast}
            onDismiss={onDismiss}
            onAction={onAction}
          />
        ))}
      </div>
    </div>,
    document.body,
  );
}
