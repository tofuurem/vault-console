import type { OperationState, WorkflowOperation } from './workflow';

const OPERATION_STYLE: Readonly<Record<OperationState, { icon: string; row: string; iconColor: string; label: string }>> = {
  pending: { icon: 'ri-checkbox-blank-circle-line', row: 'border-background-200 bg-background-50', iconColor: 'text-foreground-300', label: 'Pending' },
  running: { icon: 'ri-loader-4-line animate-spin', row: 'border-primary-200 bg-primary-50', iconColor: 'text-primary-600', label: 'In progress' },
  completed: { icon: 'ri-checkbox-circle-fill', row: 'border-emerald-200 bg-emerald-50', iconColor: 'text-emerald-600', label: 'Completed' },
  failed: { icon: 'ri-close-circle-fill', row: 'border-red-200 bg-red-50', iconColor: 'text-red-600', label: 'Failed' },
  compensating: { icon: 'ri-loader-4-line animate-spin', row: 'border-amber-200 bg-amber-50', iconColor: 'text-amber-600', label: 'Rolling back' },
  compensated: { icon: 'ri-arrow-go-back-fill', row: 'border-amber-200 bg-amber-50', iconColor: 'text-amber-600', label: 'Rolled back' },
  'compensation-failed': { icon: 'ri-error-warning-fill', row: 'border-red-300 bg-red-50', iconColor: 'text-red-700', label: 'Rollback failed' },
};

interface ApplyProgressProps {
  readonly operations: readonly WorkflowOperation[];
  readonly error?: string;
}

export default function ApplyProgress({ operations, error }: ApplyProgressProps) {
  return (
    <div className="space-y-4 p-4 sm:p-5" aria-live="polite">
      <div>
        <p className="text-xs font-medium text-foreground-700">Applying the Vault mutation plan</p>
        <p className="mt-0.5 text-[11px] text-foreground-400">Completed writes are tracked so a partial failure can be retried or compensated safely.</p>
      </div>
      <div className="space-y-1.5">
        {operations.map((operation) => {
          const style = OPERATION_STYLE[operation.state];
          return (
            <div key={operation.id} className={`flex items-center gap-2.5 rounded-md border px-3 py-2 text-xs ${style.row}`}>
              <i className={`${style.icon} ${style.iconColor} text-sm`} aria-hidden="true" />
              <span className="font-medium text-foreground-700">{operation.label}</span>
              <span className="ml-auto text-[9px] font-semibold uppercase tracking-wider text-foreground-400">{style.label}</span>
            </div>
          );
        })}
      </div>
      {error && (
        <div role="alert" className="rounded-md border border-red-200 bg-red-50 p-3 text-xs text-red-800">
          <p className="font-semibold">The user was not fully created</p>
          <p className="mt-1 text-[11px] leading-4 text-red-700">{error}</p>
          <p className="mt-1 text-[10px] text-red-600">The operation list above is the source of truth for completed and rolled-back objects.</p>
        </div>
      )}
    </div>
  );
}
