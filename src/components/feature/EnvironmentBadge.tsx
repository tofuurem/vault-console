import { useRuntimeConfig } from '@/application/config/RuntimeConfigContext';
import type { EnvironmentTone } from '@/application/config/runtime-config';

const TONES: Readonly<Record<EnvironmentTone, string>> = {
  neutral: 'border-background-300 bg-background-100 text-foreground-700',
  info: 'border-primary-200 bg-primary-50 text-primary-800',
  warning: 'border-warning-300 bg-warning-50 text-warning-900',
  danger: 'border-danger-300 bg-danger-600 text-on-danger',
};

/** Deployment label such as PROD so operators always know which Vault they act on. */
export default function EnvironmentBadge({ className = '' }: { readonly className?: string }) {
  const { environmentName, environmentTone } = useRuntimeConfig();
  if (!environmentName) return null;
  return (
    <span
      title={`Environment: ${environmentName}`}
      className={`inline-flex h-5 shrink-0 items-center rounded border px-1.5 text-[11px] font-semibold uppercase tracking-wide ${TONES[environmentTone]} ${className}`}
    >
      <span className="sr-only">Environment </span>
      {environmentName}
    </span>
  );
}
