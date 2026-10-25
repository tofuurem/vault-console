import type { ReactNode } from 'react';

import type {
  ChangePlan,
  OperationRunState,
  PlanExecutionResult,
} from '@/domain/access-control/lifecycle/model';
import AccessReview from './AccessReview';
import PlanExecutionNotice from './PlanExecutionNotice';

interface PlanReviewStepProps {
  readonly plan: ChangePlan | null;
  readonly invalidMessage: string;
  readonly confirmation: string;
  readonly onConfirmationChange: (value: string) => void;
  readonly progress: Readonly<Record<string, OperationRunState>>;
  readonly result?: PlanExecutionResult;
  readonly renderDetails?: (plan: ChangePlan) => ReactNode;
}

export default function PlanReviewStep({
  plan,
  invalidMessage,
  confirmation,
  onConfirmationChange,
  progress,
  result,
  renderDetails,
}: PlanReviewStepProps) {
  if (!plan) {
    return (
      <div role="alert" className="rounded-md border border-danger-300 bg-danger-50 p-3 text-xs text-danger-900">
        {invalidMessage}
      </div>
    );
  }
  return (
    <div className="space-y-4">
      <AccessReview
        plan={plan}
        confirmation={confirmation}
        onConfirmationChange={onConfirmationChange}
      />
      {renderDetails?.(plan)}
      {Object.keys(progress).length > 0 && (
        <div aria-live="polite" className="rounded-md border border-background-300 bg-background-50 p-3 font-mono text-[10px] text-foreground-500">
          {Object.entries(progress).map(([id, state]) => (
            <p key={id}>{id}: {state}</p>
          ))}
        </div>
      )}
      <PlanExecutionNotice result={result} />
    </div>
  );
}
