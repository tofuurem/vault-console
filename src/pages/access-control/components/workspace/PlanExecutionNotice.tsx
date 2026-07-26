import type {
  PlanExecutionResult,
} from '@/domain/access-control/lifecycle/model';

const BLOCK_REASON: Readonly<Record<
  NonNullable<PlanExecutionResult['blockReason']>,
  string
>> = {
  confirmation: 'The typed confirmation no longer matches this plan.',
  incomplete: 'Vault dependencies are no longer completely visible.',
  stale: 'Vault changed after this review was prepared. Reload and review the new state.',
  capabilities: 'The current token is missing a capability required by this plan.',
};

interface PlanExecutionNoticeProps {
  readonly result?: PlanExecutionResult;
}

export default function PlanExecutionNotice({
  result,
}: PlanExecutionNoticeProps) {
  if (!result || result.status === 'completed') return null;
  const blocked = result.status === 'blocked';
  return (
    <section
      role="alert"
      aria-live="assertive"
      className={`rounded-lg border p-3 text-xs ${
        blocked
          ? 'border-warning-300 bg-warning-50 text-warning-900'
          : 'border-danger-300 bg-danger-50 text-danger-900'
      }`}
    >
      <p className="font-semibold">
        {blocked
          ? 'Vault blocked this plan before any write'
          : 'Vault stopped after a partial apply'}
      </p>
      <p className="mt-1 text-[10px] leading-4">
        {blocked
          ? result.blockReason
            ? BLOCK_REASON[result.blockReason]
            : 'The preflight checks did not allow this plan to run.'
          : result.errorMessage ?? 'Verify the current Vault state before retrying.'}
      </p>

      {result.missingRequirements && result.missingRequirements.length > 0 && (
        <div className="mt-2 border-t border-current/10 pt-2">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em]">
            Missing Vault capabilities
          </p>
          <ul className="mt-1 space-y-1">
            {result.missingRequirements.map((requirement) => (
              <li
                key={`${requirement.path}:${requirement.anyOf.join(',')}`}
                className="break-all font-mono text-[9px] leading-4"
              >
                {requirement.path} [{requirement.anyOf.join(' or ')}]
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.operations.length > 0 && (
        <div className="mt-2 border-t border-current/10 pt-2">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em]">
            Verified operation state
          </p>
          <ul className="mt-1 space-y-1 font-mono text-[9px]">
            {result.operations.map((operation) => (
              <li key={operation.operationId}>
                {operation.operationId}: {operation.state}
              </li>
            ))}
          </ul>
        </div>
      )}

      {result.recovery.length > 0 && (
        <div className="mt-2 border-t border-current/10 pt-2">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em]">
            Recovery
          </p>
          <ol className="mt-1 list-decimal space-y-1 pl-4 text-[10px] leading-4">
            {result.recovery.map((action) => (
              <li key={action.operationId}>{action.summary}</li>
            ))}
          </ol>
        </div>
      )}
    </section>
  );
}
