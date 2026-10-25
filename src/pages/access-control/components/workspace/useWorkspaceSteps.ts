import { useState } from 'react';

export interface WorkspaceSteps<TStep extends string> {
  readonly step: TStep;
  readonly stepIndex: number;
  readonly goTo: (next: string, fieldId?: string) => void;
  readonly goBack: () => void;
  readonly goNext: () => void;
}

export function useWorkspaceSteps<TStep extends string>(
  order: readonly TStep[],
): WorkspaceSteps<TStep> {
  const [step, setStep] = useState<TStep>(order[0]);
  const stepIndex = order.indexOf(step);
  const goTo = (next: string, fieldId?: string) => {
    setStep(next as TStep);
    if (fieldId) {
      requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
    }
  };
  return {
    step,
    stepIndex,
    goTo,
    goBack: () => setStep(order[stepIndex - 1]),
    goNext: () => setStep(order[stepIndex + 1]),
  };
}
