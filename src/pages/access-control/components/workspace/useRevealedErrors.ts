import { useState } from 'react';

import type { WorkspaceValidationError } from './WorkspaceErrorSummary';

interface StepNavigation {
  readonly step: string;
  readonly goTo: (next: string, fieldId?: string) => void;
  readonly goNext: () => void;
}

/**
 * Keeps validation quiet until the operator has had a chance to act: a step's
 * errors appear once Continue is attempted on it or the operator leaves it,
 * and every error is visible on Review. Apply gating still uses all errors.
 */
export function useRevealedErrors(
  errors: readonly WorkspaceValidationError[],
  navigation: StepNavigation,
  reviewStep = 'review',
) {
  const [revealedSteps, setRevealedSteps] = useState<ReadonlySet<string>>(() => new Set());
  const reveal = (step: string) => setRevealedSteps((current) => (
    current.has(step) ? current : new Set(current).add(step)
  ));
  const visibleErrors = navigation.step === reviewStep
    ? errors
    : errors.filter(({ step }) => revealedSteps.has(step));

  const goTo = (next: string, fieldId?: string) => {
    reveal(navigation.step);
    navigation.goTo(next, fieldId);
  };
  const goNext = () => {
    reveal(navigation.step);
    if (errors.some(({ step }) => step === navigation.step)) return;
    navigation.goNext();
  };

  return { visibleErrors, goTo, goNext };
}
