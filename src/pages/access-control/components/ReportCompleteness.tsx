import type {
  UserAccessCompletenessReason,
  UserAccessReport,
} from '@/domain/access-control/user-access-report';

interface ReportCompletenessProps {
  readonly completeness: UserAccessReport['completeness'];
  readonly refreshing?: boolean;
  readonly onRetry?: () => void;
}

const PRESENTATION = {
  complete: {
    label: 'Complete',
    description: 'Every known access source was read and safely resolved.',
    icon: 'ri-checkbox-circle-fill',
    tone: 'border-success-200 bg-success-50 text-success-800',
    iconTone: 'text-success-600',
  },
  'partial-visibility': {
    label: 'Partial visibility',
    description: 'Known sources remain unresolved. Access may be broader than shown.',
    icon: 'ri-eye-off-line',
    tone: 'border-warning-200 bg-warning-50 text-warning-900',
    iconTone: 'text-warning-600',
  },
  'limited-by-policy': {
    label: 'Limited by policy',
    description: 'The current operator token blocks part of this report.',
    icon: 'ri-shield-keyhole-line',
    tone: 'border-danger-200 bg-danger-50 text-danger-900',
    iconTone: 'text-danger-600',
  },
} as const;

function reasonLabel(reason: UserAccessCompletenessReason): string {
  if (reason.source === 'identity') return 'Identity entity';
  if (reason.source === 'groups') return 'Identity groups';
  if (reason.source === 'policy-target') return `${reason.label} path rules`;
  return reason.label;
}

function retryableReason(reason: UserAccessCompletenessReason): boolean {
  return reason.reason === 'denied'
    || reason.reason === 'unavailable'
    || reason.reason === 'unreadable'
    || reason.reason === 'missing';
}

export default function ReportCompleteness({
  completeness,
  refreshing = false,
  onRetry,
}: ReportCompletenessProps) {
  const presentation = PRESENTATION[completeness.state];
  const retryable = completeness.reasons.some(retryableReason);
  const reasonLabels = [
    ...new Set(completeness.reasons.map(reasonLabel)),
  ];

  return (
    <section
      aria-label="Access report completeness"
      className={`rounded-lg border px-3 py-2.5 ${presentation.tone}`}
    >
      <div className="flex items-start gap-2.5">
        <i
          className={`${presentation.icon} mt-0.5 shrink-0 text-base ${presentation.iconTone}`}
          aria-hidden="true"
        />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <p className="text-xs font-semibold">{presentation.label}</p>
            {completeness.reasons.length > 0 && (
              <span className="rounded-full bg-background-50/70 px-1.5 py-0.5 font-mono text-[9px] font-semibold">
                {completeness.reasons.length} unresolved
              </span>
            )}
          </div>
          <p className="mt-0.5 text-[11px] leading-4 opacity-80">
            {presentation.description}
          </p>
          {reasonLabels.length > 0 && (
            <p className="mt-1.5 truncate font-mono text-[10px] opacity-75">
              {reasonLabels.join(' · ')}
            </p>
          )}
        </div>
        {onRetry && retryable && (
          <button
            type="button"
            onClick={onRetry}
            disabled={refreshing}
            className="inline-flex min-h-9 shrink-0 items-center gap-1 rounded-md px-2 text-[11px] font-semibold underline-offset-2 hover:bg-background-50/70 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-current disabled:cursor-wait disabled:opacity-60 sm:min-h-7"
          >
            <i
              className={`${refreshing ? 'ri-loader-4-line animate-spin' : 'ri-refresh-line'}`}
              aria-hidden="true"
            />
            Retry
          </button>
        )}
      </div>
    </section>
  );
}
