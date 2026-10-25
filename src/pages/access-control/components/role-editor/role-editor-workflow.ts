import {
  buildAdoptRolePlan,
  buildCreateRolePlan,
  buildUpdateRolePlan,
} from '@/application/vault/access-lifecycle/role-lifecycle';
import type {
  ChangePlan,
  RoleLifecycleSnapshot,
} from '@/domain/access-control/lifecycle/model';
import type { WorkspaceStep } from '../workspace/AccessWorkspaceShell';
import type { WorkspaceValidationError } from '../workspace/WorkspaceErrorSummary';
import {
  roleDraftHcl,
  type RoleEditorDraft,
} from './role-editor-draft';

export type RoleEditorMode = 'create' | 'edit' | 'adopt';
export type RoleEditorStep = 'overview' | 'kv' | 'dependencies' | 'review';
export const ROLE_EDITOR_STEP_ORDER: readonly RoleEditorStep[] = [
  'overview',
  'kv',
  'dependencies',
  'review',
];
const ROLE_NAME_PATTERN = /^vc-role-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

const EYEBROWS: Readonly<Record<RoleEditorMode, string>> = {
  create: 'New role',
  adopt: 'Role adoption',
  edit: 'Role policy change',
};

const APPLY_LABELS: Readonly<Record<RoleEditorMode, string>> = {
  create: 'Create role',
  adopt: 'Adopt role',
  edit: 'Apply role change',
};

export function roleEditorEyebrow(mode: RoleEditorMode): string {
  return EYEBROWS[mode];
}

export function roleEditorApplyLabel(mode: RoleEditorMode): string {
  return APPLY_LABELS[mode];
}

export function roleEditorErrors({
  policyName,
  ruleCount,
  visualSupported,
  mode,
}: {
  readonly policyName: string;
  readonly ruleCount: number;
  readonly visualSupported: boolean;
  readonly mode: RoleEditorMode;
}): readonly WorkspaceValidationError[] {
  const values: WorkspaceValidationError[] = [];
  if (!ROLE_NAME_PATTERN.test(policyName)) {
    values.push({
      id: 'role-name',
      message: 'Use lowercase letters, digits, and single hyphens for the role identifier.',
      step: 'overview',
      fieldId: 'role-slug',
    });
  }
  if (!visualSupported) {
    values.push({
      id: 'role-visual',
      message: 'This policy has rules the visual editor cannot show without changing them.',
      step: 'kv',
    });
  }
  if (mode !== 'adopt' && ruleCount === 0) {
    values.push({
      id: 'role-rules',
      message: 'Add at least one KV access target.',
      step: 'kv',
    });
  }
  return values;
}

export function buildRoleEditorPlan(
  mode: RoleEditorMode,
  snapshot: RoleLifecycleSnapshot,
  draft: RoleEditorDraft,
): ChangePlan | null {
  try {
    if (mode === 'adopt') return buildAdoptRolePlan(snapshot, draft.description);
    const domainDraft = {
      policyName: draft.policyName,
      description: draft.description,
      hcl: roleDraftHcl(draft),
    };
    return mode === 'create'
      ? buildCreateRolePlan(snapshot, domainDraft)
      : buildUpdateRolePlan(snapshot, domainDraft);
  } catch {
    return null;
  }
}

export function roleEditorSteps(
  step: RoleEditorStep,
  errors: readonly WorkspaceValidationError[],
): readonly WorkspaceStep[] {
  const invalidOn = (target: RoleEditorStep) => errors.some(({ step: errorStep }) => errorStep === target);
  return [
    {
      id: 'overview',
      label: 'Overview',
      description: 'Identifier and description',
      complete: step !== 'overview' && !invalidOn('overview'),
      invalid: invalidOn('overview'),
    },
    {
      id: 'kv',
      label: 'KV access',
      description: 'Paths and access levels',
      complete: ['dependencies', 'review'].includes(step),
      invalid: invalidOn('kv'),
    },
    {
      id: 'dependencies',
      label: 'Dependencies',
      description: 'Affected users and groups',
      complete: step === 'review',
    },
    {
      id: 'review',
      label: 'Review',
      description: 'Check changes and apply',
    },
  ];
}

export function roleEditorFooterSummary(
  mode: RoleEditorMode,
  dirty: boolean,
  targetCount: number,
): string {
  if (mode === 'adopt') return 'Capabilities remain unchanged';
  if (!dirty) return 'No draft changes';
  return `${targetCount} KV target${targetCount === 1 ? '' : 's'}`;
}
