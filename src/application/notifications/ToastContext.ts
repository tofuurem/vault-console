import { createContext, useContext } from 'react';

import type { ToastAction, ToastInput, ToastOptions } from './toast';

export interface ToastContextValue {
  notify(input: ToastInput): string;
  success(message: string, options?: ToastOptions): string;
  info(message: string, options?: ToastOptions): string;
  warning(message: string, options?: ToastOptions): string;
  error(message: string, options?: ToastOptions): string;
  action(message: string, action: ToastAction, options?: ToastOptions): string;
  dismiss(id: string): void;
}

export const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast must be used inside ToastProvider');
  return context;
}
