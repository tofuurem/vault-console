import {
  useCallback,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import ToastViewport from '@/components/base/ToastViewport';
import { ToastContext, type ToastContextValue } from './ToastContext';
import {
  createToastRecord,
  type ToastAction,
  type ToastInput,
  type ToastOptions,
  type ToastRecord,
} from './toast';

const MAX_VISIBLE_TOASTS = 4;

interface ToastProviderProps {
  readonly children: ReactNode;
}

export function ToastProvider({ children }: ToastProviderProps) {
  const nextId = useRef(0);
  const actionConsumed = useRef(new Set<string>());
  const [toasts, setToasts] = useState<readonly ToastRecord[]>([]);

  const notify = useCallback((input: ToastInput) => {
    nextId.current += 1;
    const id = `toast-${nextId.current}`;
    setToasts((current) => [...current, createToastRecord(id, input)]);
    return id;
  }, []);

  const dismiss = useCallback((id: string) => {
    actionConsumed.current.delete(id);
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const runAction = useCallback((id: string) => {
    if (actionConsumed.current.has(id)) return;
    const toast = toasts.find((candidate) => candidate.id === id);
    if (!toast?.action) return;
    actionConsumed.current.add(id);
    try {
      toast.action.onAction();
    } finally {
      dismiss(id);
    }
  }, [dismiss, toasts]);

  const value = useMemo<ToastContextValue>(() => {
    const withKind = (
      kind: Exclude<ToastInput['kind'], 'action'>,
      message: string,
      options: ToastOptions = {},
    ) => notify({ ...options, kind, message });
    return {
      notify,
      success: (message, options) => withKind('success', message, options),
      info: (message, options) => withKind('info', message, options),
      warning: (message, options) => withKind('warning', message, options),
      error: (message, options) => withKind('error', message, options),
      action: (message: string, action: ToastAction, options?: ToastOptions) => notify({
        ...options,
        kind: 'action',
        message,
        action,
      }),
      dismiss,
    };
  }, [dismiss, notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport
        toasts={toasts.slice(0, MAX_VISIBLE_TOASTS)}
        onDismiss={dismiss}
        onAction={runAction}
      />
    </ToastContext.Provider>
  );
}
