import {
  buildUserEditPlan,
  type UserEditDraft,
} from '@/application/vault/access-lifecycle/user-lifecycle';
import type {
  ChangePlan,
  UserLifecycleSnapshot,
} from '@/domain/access-control/lifecycle/model';
import type { WorkspaceStep } from '../workspace/AccessWorkspaceShell';
import type { WorkspaceValidationError } from '../workspace/WorkspaceErrorSummary';

export type UserEditorStep = 'account' | 'sources' | 'direct' | 'review';

export const STEP_ORDER: readonly UserEditorStep[] = [
  'account',
  'sources',
  'direct',
  'review',
];

export function userEditorErrors(
  managedBy: string | undefined,
  displayName: string,
): readonly WorkspaceValidationError[] {
  const values: WorkspaceValidationError[] = [];
  if (managedBy === 'vault-console' && !displayName.trim()) {
    values.push({
      id: 'display-name',
      message: 'Display name is required for a managed Identity entity.',
      step: 'account',
      fieldId: 'user-display-name',
    });
  }
  return values;
}

export function buildUserEditPlanOrNull(
  snapshot: UserLifecycleSnapshot,
  input: UserEditDraft,
): ChangePlan | null {
  try {
    return buildUserEditPlan(snapshot, input);
  } catch {
    return null;
  }
}

export function canApplyUserEditPlan({
  plan,
  errors,
  confirmation,
  applying,
}: {
  readonly plan: ChangePlan | null;
  readonly errors: readonly WorkspaceValidationError[];
  readonly confirmation: string;
  readonly applying: boolean;
}): boolean {
  const confirmationValid = !plan?.confirmation?.required
    || confirmation === plan.confirmation.value;
  return Boolean(
    plan
    && plan.operations.length > 0
    && plan.visibility.complete
    && errors.length === 0
    && confirmationValid
    && !applying,
  );
}

export function buildUserEditorSteps(
  step: UserEditorStep,
  errors: readonly WorkspaceValidationError[],
): readonly WorkspaceStep[] {
  return [
    {
      id: 'account',
      label: 'Account',
      description: 'Login and token settings',
      complete: step !== 'account' && errors.length === 0,
      invalid: errors.some((error) => error.step === 'account'),
    },
    {
      id: 'sources',
      label: 'Groups & roles',
      description: 'Identity and token policies',
      complete: ['direct', 'review'].includes(step),
    },
    {
      id: 'direct',
      label: 'Direct KV',
      description: 'Per-user policy layer',
      complete: step === 'review',
    },
    {
      id: 'review',
      label: 'Review',
      description: 'Check and apply',
    },
  ];
}
