export type ToastKind = 'success' | 'info' | 'warning' | 'error' | 'action';

export interface ToastAction {
  readonly label: string;
  readonly onAction: () => void;
}

export interface ToastOptions {
  readonly title?: string;
  readonly durationMs?: number | null;
}

export interface ToastInput extends ToastOptions {
  readonly kind: ToastKind;
  readonly message: string;
  readonly action?: ToastAction;
}

export interface ToastRecord extends ToastInput {
  readonly id: string;
  readonly durationMs: number | null;
}

const DEFAULT_DURATIONS: Readonly<Record<ToastKind, number | null>> = {
  success: 4_000,
  info: 6_000,
  warning: 6_000,
  error: null,
  action: 10_000,
};

export function defaultToastDuration(kind: ToastKind): number | null {
  return DEFAULT_DURATIONS[kind];
}

export function createToastRecord(id: string, input: ToastInput): ToastRecord {
  return {
    ...input,
    id,
    durationMs: input.durationMs === undefined
      ? defaultToastDuration(input.kind)
      : input.durationMs,
  };
}
