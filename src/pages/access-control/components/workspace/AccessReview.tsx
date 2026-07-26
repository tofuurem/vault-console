import type {
  ChangePlan,
  EffectTiming,
  PermissionPoint,
} from '@/domain/access-control/lifecycle/model';

const TIMING_LABELS: Readonly<Record<EffectTiming, string>> = {
  'next-request': 'Live on the next request',
  'next-login': 'Applies on the next login',
  'does-not-revoke': 'Existing tokens are not revoked',
  'destructive-cleanup': 'Destructive cleanup',
};

const TIMING_ICONS: Readonly<Record<EffectTiming, string>> = {
  'next-request': 'ri-flashlight-line',
  'next-login': 'ri-login-circle-line',
  'does-not-revoke': 'ri-timer-line',
  'destructive-cleanup': 'ri-delete-bin-6-line',
};

function PermissionList({
  title,
  tone,
  values,
}: {
  readonly title: string;
  readonly tone: 'added' | 'removed';
  readonly values: readonly PermissionPoint[];
}) {
  return (
    <section className="min-w-0 rounded-lg border border-background-300 bg-background-50">
      <header className="flex items-center justify-between border-b border-background-200 px-3 py-2">
        <h3 className="text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-500">
          {title}
        </h3>
        <span className={`rounded-sm px-1.5 py-0.5 font-mono text-[9px] ${
          tone === 'added'
            ? 'bg-success-100 text-success-800'
            : 'bg-danger-100 text-danger-800'
        }`}>
          {values.length}
        </span>
      </header>
      <div className="max-h-48 overflow-y-auto p-2">
        {values.length === 0 ? (
          <p className="px-1 py-3 text-center text-[10px] text-foreground-400">No changes</p>
        ) : values.map((point) => (
          <div
            key={`${point.pattern}:${point.capability}`}
            className="flex min-w-0 items-center gap-2 border-b border-background-100 px-1 py-1.5 last:border-0"
          >
            <span className={`font-mono text-[10px] font-semibold ${
              tone === 'added' ? 'text-success-700' : 'text-danger-700'
            }`}>
              {tone === 'added' ? '+' : '−'} {point.capability}
            </span>
            <span className="truncate font-mono text-[9px] text-foreground-600">
              {point.pattern}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

interface AccessReviewProps {
  readonly plan: ChangePlan;
  readonly confirmation: string;
  readonly onConfirmationChange: (value: string) => void;
}

export default function AccessReview({
  plan,
  confirmation,
  onConfirmationChange,
}: AccessReviewProps) {
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
          Change ledger
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground-950">
          Review before Vault changes
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-foreground-500">
          The plan is refreshed against Vault immediately before Apply. No operation is atomic
          across auth, Identity, and policy endpoints.
        </p>
      </div>

      {!plan.visibility.complete && (
        <div role="alert" className="rounded-lg border border-warning-300 bg-warning-50 p-3 text-warning-900">
          <div className="flex items-start gap-2">
            <i className="ri-error-warning-line mt-0.5 text-sm" aria-hidden="true" />
            <div>
              <p className="text-xs font-semibold">Incomplete access picture</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-4">
                {plan.visibility.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
            </div>
          </div>
        </div>
      )}

      <div className="grid gap-3 md:grid-cols-2">
        <PermissionList title="Capabilities added" tone="added" values={plan.permissionDiff.added} />
        <PermissionList title="Capabilities removed" tone="removed" values={plan.permissionDiff.removed} />
      </div>

      <section aria-labelledby="operation-plan-heading" className="rounded-lg border border-background-300 bg-background-50">
        <header className="border-b border-background-200 px-4 py-3">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground-400">
            Ordered execution
          </p>
          <h3 id="operation-plan-heading" className="mt-0.5 text-sm font-semibold text-foreground-900">
            {plan.operations.length} operation{plan.operations.length === 1 ? '' : 's'}
          </h3>
        </header>
        <ol className="divide-y divide-background-200">
          {plan.operations.map((operation, index) => (
            <li key={operation.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[28px_1fr_auto] sm:items-start">
              <span className="flex h-6 w-6 items-center justify-center rounded-sm bg-foreground-950 font-mono text-[9px] text-background-50">
                {String(index + 1).padStart(2, '0')}
              </span>
              <div className="min-w-0">
                <p className="text-xs font-semibold text-foreground-800">{operation.label}</p>
                <div className="mt-1 space-y-0.5">
                  {operation.requirements.map((requirement) => (
                    <p key={requirement.path} className="break-all font-mono text-[9px] text-foreground-400">
                      {requirement.path}
                      <span className="ml-1 text-foreground-300">
                        [{requirement.anyOf.join(' or ')}]
                      </span>
                    </p>
                  ))}
                </div>
              </div>
              <span className={`inline-flex w-fit items-center gap-1 rounded-sm border px-1.5 py-1 text-[9px] font-medium ${
                operation.effectTiming === 'destructive-cleanup'
                  ? 'border-danger-200 bg-danger-50 text-danger-700'
                  : operation.effectTiming === 'does-not-revoke'
                    ? 'border-warning-200 bg-warning-50 text-warning-800'
                    : 'border-primary-200 bg-primary-50 text-primary-700'
              }`}>
                <i className={TIMING_ICONS[operation.effectTiming]} aria-hidden="true" />
                {TIMING_LABELS[operation.effectTiming]}
              </span>
            </li>
          ))}
          {plan.operations.length === 0 && (
            <li className="px-4 py-8 text-center text-xs text-foreground-400">
              No Vault changes in this draft.
            </li>
          )}
        </ol>
      </section>

      {plan.confirmation?.required && (
        <section className="rounded-lg border border-danger-300 bg-danger-50 p-4">
          <div className="flex items-start gap-3">
            <i className="ri-alarm-warning-line mt-0.5 text-lg text-danger-600" aria-hidden="true" />
            <div className="min-w-0 flex-1">
              <h3 className="text-xs font-semibold text-danger-900">High-risk confirmation</h3>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[10px] leading-4 text-danger-800">
                {plan.confirmation.reasons.map((reason) => <li key={reason}>{reason}</li>)}
              </ul>
              <label className="mt-3 block">
                <span className="text-[10px] font-medium text-danger-900">
                  Type {plan.confirmation.value} to confirm
                </span>
                <input
                  type="text"
                  value={confirmation}
                  onChange={(event) => onConfirmationChange(event.target.value)}
                  autoComplete="off"
                  spellCheck={false}
                  className="mt-1 h-10 w-full rounded-md border border-danger-300 bg-background-50 px-3 font-mono text-xs text-foreground-900 outline-none focus:border-danger-500 focus:ring-2 focus:ring-danger-200"
                />
              </label>
            </div>
          </div>
        </section>
      )}
    </div>
  );
}
