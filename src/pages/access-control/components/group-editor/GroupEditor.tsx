import { useMemo, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  useGroupLifecycleSnapshot,
} from '@/application/vault/access-lifecycle/lifecycle-queries';
import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import { loadGroupLifecycleSnapshot } from '@/application/vault/access-lifecycle/group-lifecycle';
import ContentSkeleton from '@/components/base/ContentSkeleton';
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
import WorkspaceLoadError from '../workspace/WorkspaceLoadError';
import WorkspaceStepFooter from '../workspace/WorkspaceStepFooter';
import GroupMembersStep from './GroupMembersStep';
import GroupOverviewStep from './GroupOverviewStep';
import GroupRolesStep from './GroupRolesStep';
import {
  groupEditorDraftKey,
  initialGroupEditorDraft,
  toGroupDraft,
  type GroupEditorDraft as GroupEditorDraftState,
} from './group-editor-draft';
import {
  buildGroupEditorPlan,
  createdGroupId,
  GROUP_EDITOR_STEP_ORDER,
  groupEditorErrors,
  groupEditorSteps,
} from './group-editor-workflow';

interface GroupEditorProps {
  readonly groupId?: string;
  readonly catalog: CreateUserAccessCatalog;
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly onClose: () => void;
  readonly onDone: (groupId: string) => void;
  readonly onSessionExpired?: () => void;
}

export default function GroupEditor({
  groupId,
  catalog,
  gateway,
  session,
  onClose,
  onDone,
  onSessionExpired,
}: GroupEditorProps) {
  const query = useGroupLifecycleSnapshot({ gateway, session }, groupId);
  if (query.isPending || !query.data) {
    return <ContentSkeleton label="Loading the group workspace" variant="workspace" />;
  }
  if (query.isError) {
    return (
      <WorkspaceLoadError
        message="The group workspace could not be loaded."
        onRetry={() => { void query.refetch(); }}
        onBack={onClose}
      />
    );
  }
  return (
    <GroupEditorForm
      key={query.data.fingerprint}
      groupId={groupId}
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

function GroupEditorForm({
  groupId,
  snapshot,
  catalog,
  gateway,
  session,
  onClose,
  onDone,
  onSessionExpired,
}: Omit<GroupEditorProps, 'groupId'> & {
  readonly groupId?: string;
  readonly snapshot: Awaited<ReturnType<typeof loadGroupLifecycleSnapshot>>;
}) {
  const queryClient = useQueryClient();
  const initial = useMemo(
    () => initialGroupEditorDraft(snapshot, catalog),
    [catalog, snapshot],
  );
  const [draft, setDraft] = useState<GroupEditorDraftState>(initial);
  const steps = useWorkspaceSteps(GROUP_EDITOR_STEP_ORDER);
  const workflow = usePlanApplyWorkflow({ gateway, session, onSessionExpired });
  const { step } = steps;
  const dirty = groupEditorDraftKey(draft) !== groupEditorDraftKey(initial);
  const errors = useMemo(() => groupEditorErrors(draft.name), [draft.name]);
  const groupNameError = errors.find(({ fieldId }) => fieldId === 'group-name')?.message;
  const domainDraft = useMemo(
    () => toGroupDraft(snapshot, draft, catalog),
    [catalog, draft, snapshot],
  );
  const plan = useMemo(
    () => buildGroupEditorPlan(groupId, snapshot, domainDraft),
    [domainDraft, groupId, snapshot],
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
        const fresh = await loadGroupLifecycleSnapshot(
          gateway,
          session,
          groupId,
          signal,
        );
        return {
          fingerprint: fresh.fingerprint,
          visibility: fresh.visibility,
        };
      },
      onCompleted: async (execution) => {
        const createdId = createdGroupId(execution);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: vaultQueryKeys.groups() }),
          queryClient.invalidateQueries({
            queryKey: vaultQueryKeys.groupEditor(groupId ?? 'new'),
          }),
        ]);
        const resolvedId = groupId ?? createdId;
        if (!resolvedId) throw new Error('Vault did not return the created group ID.');
        workflow.workspace.current?.allowNextNavigation();
        onDone(resolvedId);
      },
    });
  };

  return (
    <AccessWorkspaceShell
      ref={workflow.workspace}
      eyebrow={groupId ? 'Group access change' : 'New managed group'}
      title={groupId ? snapshot.group?.name ?? 'Managed group' : 'Create group'}
      subtitle={groupId ? `identity/group/id/${groupId}` : 'identity/group'}
      steps={groupEditorSteps(step, errors)}
      activeStep={step}
      onStepChange={steps.goTo}
      onClose={onClose}
      dirty={dirty && workflow.result?.status !== 'completed'}
      stateLabel={workflow.applying ? 'Applying' : groupId ? 'Draft' : 'New'}
      footer={(
        <WorkspaceStepFooter
          summary={dirty ? '1 staged Vault operation' : 'No draft changes'}
          stepIndex={steps.stepIndex}
          reviewing={step === 'review'}
          continueDisabled={step === 'overview' && errors.length > 0}
          onBack={steps.goBack}
          onContinue={steps.goNext}
          applyLabel={groupId ? 'Apply group change' : 'Create group'}
          applying={workflow.applying}
          canApply={canApply}
          onApply={apply}
        />
      )}
    >
      <WorkspaceErrorSummary errors={errors} onNavigate={steps.goTo} />
      {step === 'overview' && (
        <GroupOverviewStep
          snapshot={snapshot}
          draft={draft}
          nameError={groupNameError}
          onChange={setDraft}
        />
      )}
      {step === 'members' && (
        <GroupMembersStep snapshot={snapshot} draft={draft} onChange={setDraft} />
      )}
      {step === 'roles' && (
        <GroupRolesStep
          snapshot={snapshot}
          catalog={catalog}
          draft={draft}
          onChange={setDraft}
        />
      )}
      {step === 'review' && (
        <PlanReviewStep
          plan={plan}
          invalidMessage="This group draft cannot be represented as a safe Vault plan."
          confirmation={workflow.confirmation}
          onConfirmationChange={workflow.setConfirmation}
          progress={workflow.progress}
          result={workflow.result}
        />
      )}
    </AccessWorkspaceShell>
  );
}
