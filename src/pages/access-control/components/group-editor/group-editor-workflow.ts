import {
  buildCreateGroupPlan,
  buildUpdateGroupPlan,
  type GroupDraft,
} from '@/application/vault/access-lifecycle/group-lifecycle';
import type {
  ChangePlan,
  GroupLifecycleSnapshot,
  PlanExecutionResult,
} from '@/domain/access-control/lifecycle/model';
import type { WorkspaceStep } from '../workspace/AccessWorkspaceShell';
import type { WorkspaceValidationError } from '../workspace/WorkspaceErrorSummary';

export type GroupEditorStep = 'overview' | 'members' | 'roles' | 'review';
export const GROUP_EDITOR_STEP_ORDER: readonly GroupEditorStep[] = [
  'overview',
  'members',
  'roles',
  'review',
];

export function groupEditorErrors(name: string): readonly WorkspaceValidationError[] {
  const values: WorkspaceValidationError[] = [];
  if (!name.trim()) {
    values.push({
      id: 'group-name-required',
      message: 'Group name is required.',
      step: 'overview',
      fieldId: 'group-name',
    });
  }
  return values;
}

export function buildGroupEditorPlan(
  groupId: string | undefined,
  snapshot: GroupLifecycleSnapshot,
  domainDraft: GroupDraft,
): ChangePlan | null {
  try {
    return groupId
      ? buildUpdateGroupPlan(snapshot, domainDraft)
      : buildCreateGroupPlan(snapshot, domainDraft);
  } catch {
    return null;
  }
}

export function groupEditorSteps(
  step: GroupEditorStep,
  errors: readonly WorkspaceValidationError[],
): readonly WorkspaceStep[] {
  return [
    {
      id: 'overview',
      label: 'Overview',
      description: 'Name and owned metadata',
      complete: step !== 'overview' && errors.length === 0,
      invalid: errors.length > 0,
    },
    {
      id: 'members',
      label: 'Members',
      description: 'Direct Identity entities',
      complete: ['roles', 'review'].includes(step),
    },
    {
      id: 'roles',
      label: 'Roles',
      description: 'Managed policy attachments',
      complete: step === 'review',
    },
    {
      id: 'review',
      label: 'Review',
      description: 'Preflight and apply',
    },
  ];
}

export function createdGroupId(execution: PlanExecutionResult): string | undefined {
  return execution.operations.find(
    ({ operationId }) => operationId === 'create-group',
  )?.resourceId;
}
