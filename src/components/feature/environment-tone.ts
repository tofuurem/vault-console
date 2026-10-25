import type { EnvironmentTone } from '@/application/config/runtime-config';

/** Thin colored edge on the app chrome for warning and danger environments. */
export function environmentEdgeClass(tone: EnvironmentTone, named: boolean): string {
  if (!named) return '';
  if (tone === 'danger') return 'border-t-2 border-t-danger-500';
  if (tone === 'warning') return 'border-t-2 border-t-warning-500';
  return '';
}
