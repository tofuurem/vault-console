import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  useRoleLifecycleSnapshot,
} from '@/application/vault/access-lifecycle/lifecycle-queries';
import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import { loadRoleLifecycleSnapshot } from '@/application/vault/access-lifecycle/role-lifecycle';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import type { RoleLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import type {
  VaultAccessControlGateway,
  VaultSession,
} from '@/domain/vault/contracts';
import type { CreateUserAccessCatalog } from '../create-user/access';
import AccessWorkspaceShell from '../workspace/AccessWorkspaceShell';
import PlanReviewStep from '../workspace/PlanReviewStep';
import {
  canApplyPlan,
  usePlanApplyWorkflow,
} from '../workspace/usePlanApplyWorkflow';
import { useWorkspaceSteps } from '../workspace/useWorkspaceSteps';
import WorkspaceErrorSummary from '../workspace/WorkspaceErrorSummary';
import { useRevealedErrors } from '../workspace/useRevealedErrors';
import WorkspaceLoadError from '../workspace/WorkspaceLoadError';
import WorkspaceStepFooter from '../workspace/WorkspaceStepFooter';
import RoleDependenciesStep from './RoleDependenciesStep';
import RoleKvAccessStep from './RoleKvAccessStep';
import RoleOverviewStep from './RoleOverviewStep';
import RolePolicyDiff from './RolePolicyDiff';
import {
  initialRoleEditorState,
  roleEditorDraftKey,
  type RoleEditorDraft as RoleEditorDraftState,
} from './role-editor-draft';
import {
  buildRoleEditorPlan,
  ROLE_EDITOR_STEP_ORDER,
  roleEditorApplyLabel,
  roleEditorErrors,
  roleEditorEyebrow,
  roleEditorFooterSummary,
  roleEditorSteps,
  type RoleEditorMode,
} from './role-editor-workflow';

export type { RoleEditorMode } from './role-editor-workflow';

interface RoleEditorProps {
  readonly mode: RoleEditorMode;
  readonly policyName?: string;
  readonly catalog: CreateUserAccessCatalog;
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly onClose: () => void;
  readonly onDone: (policyName: string) => void;
  readonly onSessionExpired?: () => void;
}

export default function RoleEditor({
  mode,
  policyName,
  catalog,
  gateway,
  session,
  onClose,
  onDone,
  onSessionExpired,
}: RoleEditorProps) {
  const query = useRoleLifecycleSnapshot({ gateway, session }, policyName);
  if (query.isPending || !query.data) {
    return <ContentSkeleton label="Loading the role workspace" variant="workspace" />;
  }
  if (query.isError) {
    return (
      <WorkspaceLoadError
        message="The role workspace could not be loaded."
        onRetry={() => { void query.refetch(); }}
        onBack={onClose}
      />
    );
  }
  return (
    <RoleEditorForm
      key={query.data.fingerprint}
      mode={mode}
      policyName={policyName}
      snapshot={query.data}
      catalog={catalog}
      gateway={gateway}
      session={session}
      onClose={onClose}
      onDone={onDone}
      onSessionExpired={onSessionExpired}
    />
  );
}

function RoleEditorForm({
  mode,
  policyName,
  snapshot,
  catalog,
  gateway,
  session,
  onClose,
  onDone,
  onSessionExpired,
}: Omit<RoleEditorProps, 'policyName'> & {
  readonly policyName?: string;
  readonly snapshot: RoleLifecycleSnapshot;
}) {
  const queryClient = useQueryClient();
  const initial = useMemo(
    () => initialRoleEditorState(snapshot, catalog),
    [catalog, snapshot],
  );
  const [draft, setDraft] = useState<RoleEditorDraftState>(initial.draft);
  const steps = useWorkspaceSteps(ROLE_EDITOR_STEP_ORDER);
  const workflow = usePlanApplyWorkflow({ gateway, session, onSessionExpired });
  const { step } = steps;
  const dirty = mode === 'adopt'
    || roleEditorDraftKey(draft) !== roleEditorDraftKey(initial.draft);
  const errors = useMemo(
    () => roleEditorErrors({
      policyName: draft.policyName,
      ruleCount: draft.directRules.length,
      visualSupported: initial.visualSupported,
      mode,
    }),
    [draft.directRules.length, draft.policyName, initial.visualSupported, mode],
  );
  const validation = useRevealedErrors(errors, steps);
  const roleNameError = validation.visibleErrors.find(({ fieldId }) => fieldId === 'role-slug')?.message;
  const plan = useMemo(
    () => buildRoleEditorPlan(mode, snapshot, draft),
    [draft, mode, snapshot],
  );
  const canApply = canApplyPlan(plan, {
    dirty,
    errors,
    confirmation: workflow.confirmation,
    applying: workflow.applying,
  });
  const apply = async () => {
    if (!plan || !canApply) return;
    await workflow.run(plan, {
      loadFreshState: async (signal) => {
        const fresh = await loadRoleLifecycleSnapshot(
          gateway,
          session,
          mode === 'create' ? draft.policyName : policyName,
          signal,
        );
        return {
          fingerprint: fresh.fingerprint,
          visibility: fresh.visibility,
        };
      },
      onCompleted: async () => {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: vaultQueryKeys.policies() }),
          queryClient.invalidateQueries({
            queryKey: vaultQueryKeys.policy(draft.policyName),
          }),
          queryClient.invalidateQueries({
            queryKey: vaultQueryKeys.policyCatalogs(),
          }),
          queryClient.invalidateQueries({
            queryKey: vaultQueryKeys.roleEditor(policyName ?? 'new'),
          }),
        ]);
        workflow.workspace.current?.allowNextNavigation();
        onDone(draft.policyName);
      },
    });
  };

  return (
    <AccessWorkspaceShell
      ref={workflow.workspace}
      eyebrow={roleEditorEyebrow(mode)}
      title={mode === 'create' ? 'Create role' : snapshot.policy?.name ?? 'Role'}
      subtitle={draft.policyName || 'sys/policies/acl/vc-role-*'}
      steps={roleEditorSteps(step, validation.visibleErrors)}
      activeStep={step}
      onStepChange={validation.goTo}
      onClose={onClose}
      dirty={dirty && workflow.result?.status !== 'completed'}
      stateLabel={workflow.applying ? 'Applying' : mode === 'adopt' ? 'Adoption' : 'Draft'}
      footer={(
        <WorkspaceStepFooter
          summary={roleEditorFooterSummary(mode, dirty, draft.directRules.length)}
          stepIndex={steps.stepIndex}
          reviewing={step === 'review'}
          onBack={steps.goBack}
          onContinue={validation.goNext}
          applyLabel={roleEditorApplyLabel(mode)}
          applying={workflow.applying}
          canApply={canApply}
          onApply={apply}
        />
      )}
    >
      <WorkspaceErrorSummary errors={validation.visibleErrors} onNavigate={validation.goTo} />
      {step === 'overview' && (
        <RoleOverviewStep
          mode={mode}
          snapshot={snapshot}
          draft={draft}
          nameError={roleNameError}
          onChange={setDraft}
        />
      )}
      {step === 'kv' && (
        <RoleKvAccessStep
          catalog={catalog}
          session={session}
          draft={draft}
          readOnly={mode === 'adopt'}
          supported={initial.visualSupported}
          onChange={setDraft}
        />
      )}
      {step === 'dependencies' && <RoleDependenciesStep snapshot={snapshot} />}
      {step === 'review' && (
        <PlanReviewStep
          plan={plan}
          invalidMessage="This role draft cannot be represented as a safe Vault change plan."
          confirmation={workflow.confirmation}
          onConfirmationChange={workflow.setConfirmation}
          progress={workflow.progress}
          result={workflow.result}
          renderDetails={(reviewPlan) => (
            <RolePolicyDiff mode={mode} snapshot={snapshot} plan={reviewPlan} />
          )}
        />
      )}
    </AccessWorkspaceShell>
  );
}
