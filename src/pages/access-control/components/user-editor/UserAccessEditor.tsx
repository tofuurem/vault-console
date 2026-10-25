import {
  useMemo,
  useRef,
  useState,
} from 'react';

import {
  useUserLifecycleSnapshot,
} from '@/application/vault/access-lifecycle/lifecycle-queries';
import type { UserLifecycleRef } from '@/application/vault/access-lifecycle/user-lifecycle';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import type {
  ChangePlan,
  OperationRunState,
  PlanExecutionResult,
  UserLifecycleSnapshot,
} from '@/domain/access-control/lifecycle/model';
import type {
  VaultAccessControlGateway,
  VaultSession,
} from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';
import type { CreateUserAccessCatalog } from '../create-user/access';
import AccessReview from '../workspace/AccessReview';
import AccessWorkspaceShell, {
  type AccessWorkspaceShellHandle,
} from '../workspace/AccessWorkspaceShell';
import PlanExecutionNotice from '../workspace/PlanExecutionNotice';
import WorkspaceErrorSummary from '../workspace/WorkspaceErrorSummary';
import UserAccountStep from './UserAccountStep';
import UserDirectKvStep from './UserDirectKvStep';
import UserEditorFooter from './UserEditorFooter';
import UserGroupsRolesStep from './UserGroupsRolesStep';
import {
  createUserEditorInitialState,
  editorDirectPolicy,
  userEditorDraftKey,
  type UserEditorDraft,
} from './user-editor-draft';
import {
  buildUserEditPlanOrNull,
  buildUserEditorSteps,
  canApplyUserEditPlan,
  STEP_ORDER,
  userEditorErrors,
  type UserEditorStep,
} from './user-editor-plan';
import { useUserEditorApply } from './useUserEditorApply';

function ErrorState({
  message,
  onRetry,
  onClose,
}: {
  readonly message: string;
  readonly onRetry: () => void;
  readonly onClose: () => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 items-center justify-center bg-background-100 p-5">
      <div role="alert" className="w-full max-w-md rounded-lg border border-warning-300 bg-warning-50 p-4">
        <p className="text-sm font-semibold text-warning-900">User editor could not be loaded</p>
        <p className="mt-1 text-xs leading-5 text-warning-800">{message}</p>
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={onRetry}>Retry</Button>
          <Button size="sm" variant="ghost" onClick={onClose}>Back to user</Button>
        </div>
      </div>
    </div>
  );
}

interface UserAccessEditorProps {
  readonly reference: UserLifecycleRef;
  readonly catalog: CreateUserAccessCatalog;
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly onSessionExpired?: () => void;
}

export default function UserAccessEditor({
  reference,
  catalog,
  gateway,
  session,
  onClose,
  onDone,
  onSessionExpired,
}: UserAccessEditorProps) {
  const query = useUserLifecycleSnapshot({ gateway, session }, reference);
  if (query.isPending || !query.data) {
    return <ContentSkeleton label="Loading the user access editor" variant="workspace" />;
  }
  if (query.isError) {
    return (
      <ErrorState
        message={normalizeVaultError(query.error).message}
        onRetry={() => { void query.refetch(); }}
        onClose={onClose}
      />
    );
  }
  return (
    <UserAccessEditorForm
      key={query.data.fingerprint}
      snapshot={query.data}
      reference={reference}
      catalog={catalog}
      gateway={gateway}
      session={session}
      onClose={onClose}
      onDone={onDone}
      onSessionExpired={onSessionExpired}
    />
  );
}

function UserEditorReview({
  plan,
  confirmation,
  onConfirmationChange,
  progress,
  result,
}: {
  readonly plan: ChangePlan;
  readonly confirmation: string;
  readonly onConfirmationChange: (value: string) => void;
  readonly progress: Readonly<Record<string, OperationRunState>>;
  readonly result: PlanExecutionResult | undefined;
}) {
  return (
    <div className="space-y-4">
      <AccessReview
        plan={plan}
        confirmation={confirmation}
        onConfirmationChange={onConfirmationChange}
      />
      {Object.keys(progress).length > 0 && (
        <section aria-live="polite" className="rounded-lg border border-background-300 bg-background-50 p-3">
          <p className="font-mono text-[10px] font-semibold uppercase tracking-[0.12em] text-foreground-400">
            Apply progress
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {Object.entries(progress).map(([operationId, state]) => (
              <span key={operationId} className="rounded-sm bg-background-100 px-2 py-1 font-mono text-[10px] text-foreground-600">
                {operationId}: {state}
              </span>
            ))}
          </div>
        </section>
      )}
      <PlanExecutionNotice result={result} />
    </div>
  );
}

function UserAccessEditorForm({
  snapshot,
  reference,
  catalog,
  gateway,
  session,
  onClose,
  onDone,
  onSessionExpired,
}: {
  readonly snapshot: UserLifecycleSnapshot;
  readonly reference: UserLifecycleRef;
  readonly catalog: CreateUserAccessCatalog;
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly onClose: () => void;
  readonly onDone: () => void;
  readonly onSessionExpired?: () => void;
}) {
  const workspace = useRef<AccessWorkspaceShellHandle>(null);
  const initial = useMemo(
    () => createUserEditorInitialState(snapshot, catalog),
    [catalog, snapshot],
  );
  const [draft, setDraft] = useState<UserEditorDraft>(initial.draft);
  const [step, setStep] = useState<UserEditorStep>('account');
  const [confirmation, setConfirmation] = useState('');
  const {
    apply: applyPlan,
    applying,
    progress,
    result,
  } = useUserEditorApply({
    reference,
    gateway,
    session,
    workspace,
    onDone,
    onSessionExpired,
  });
  const dirty = userEditorDraftKey(draft) !== userEditorDraftKey(initial.draft);
  const managedRolePolicyNames = catalog.roles.flatMap(({ policyNames }) => policyNames);
  const managedBy = snapshot.entity?.metadata?.managed_by;
  const errors = useMemo(
    () => userEditorErrors(managedBy, draft.displayName),
    [draft.displayName, managedBy],
  );
  const displayNameError = errors.find(
    ({ fieldId }) => fieldId === 'user-display-name',
  )?.message;
  const directPolicy = editorDirectPolicy(
    snapshot,
    draft,
    initial.directPolicySupported,
  );
  const plan = useMemo(() => buildUserEditPlanOrNull(snapshot, {
    displayName: draft.displayName,
    groupIds: draft.groupIds,
    directRolePolicyNames: draft.directRoleIds,
    managedRolePolicyNames,
    directPolicy,
    adoptDirectPolicy: draft.adoptDirectPolicy,
  }), [
    directPolicy,
    draft,
    managedRolePolicyNames,
    snapshot,
  ]);
  const canApply = canApplyUserEditPlan({ plan, errors, confirmation, applying });
  const steps = buildUserEditorSteps(step, errors);
  const stepIndex = STEP_ORDER.indexOf(step);
  const continueBlocked = errors.length > 0 && step === 'account';
  const goTo = (next: string, fieldId?: string) => {
    setStep(next as UserEditorStep);
    if (fieldId) {
      requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
    }
  };
  const apply = async () => {
    if (!plan || !canApply) return;
    await applyPlan(plan, confirmation);
  };

  return (
    <AccessWorkspaceShell
      ref={workspace}
      eyebrow="User access change"
      title={snapshot.entity?.name ?? snapshot.account.username}
      subtitle={`auth/${snapshot.account.mount}/users/${snapshot.account.username}`}
      steps={steps}
      activeStep={step}
      onStepChange={goTo}
      onClose={onClose}
      dirty={dirty && result?.status !== 'completed'}
      stateLabel={applying ? 'Applying' : 'Draft'}
      footer={(
        <UserEditorFooter
          dirty={dirty}
          operationCount={plan?.operations.length ?? 0}
          showBack={stepIndex > 0}
          reviewing={step === 'review'}
          continueBlocked={continueBlocked}
          applying={applying}
          canApply={canApply}
          onBack={() => setStep(STEP_ORDER[stepIndex - 1])}
          onContinue={() => {
            if (continueBlocked) return;
            setStep(STEP_ORDER[stepIndex + 1]);
          }}
          onApply={() => { void apply(); }}
        />
      )}
    >
      <WorkspaceErrorSummary errors={errors} onNavigate={goTo} />
      {step === 'account' && (
        <UserAccountStep
          snapshot={snapshot}
          draft={draft}
          displayNameError={displayNameError}
          onChange={setDraft}
        />
      )}
      {step === 'sources' && (
        <UserGroupsRolesStep
          snapshot={snapshot}
          catalog={catalog}
          draft={draft}
          onChange={setDraft}
        />
      )}
      {step === 'direct' && (
        <UserDirectKvStep
          snapshot={snapshot}
          catalog={catalog}
          session={session}
          draft={draft}
          supported={initial.directPolicySupported}
          onChange={setDraft}
        />
      )}
      {step === 'review' && plan && (
        <UserEditorReview
          plan={plan}
          confirmation={confirmation}
          onConfirmationChange={setConfirmation}
          progress={progress}
          result={result}
        />
      )}
      {step === 'review' && !plan && (
        <div role="alert" className="rounded-lg border border-danger-300 bg-danger-50 p-4 text-xs text-danger-900">
          This draft cannot be represented as a safe Vault change plan.
        </div>
      )}
    </AccessWorkspaceShell>
  );
}
