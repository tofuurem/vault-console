import {
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import {
  ChangePlanExecutor,
} from '@/application/vault/access-lifecycle/change-plan-executor';
import {
  buildUserEditPlan,
  loadUserLifecycleSnapshot,
  type UserLifecycleRef,
} from '@/application/vault/access-lifecycle/user-lifecycle';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import type {
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
  type WorkspaceStep,
} from '../workspace/AccessWorkspaceShell';
import PlanExecutionNotice from '../workspace/PlanExecutionNotice';
import WorkspaceErrorSummary, {
  type WorkspaceValidationError,
} from '../workspace/WorkspaceErrorSummary';
import UserAccountStep from './UserAccountStep';
import UserDirectKvStep from './UserDirectKvStep';
import UserGroupsRolesStep from './UserGroupsRolesStep';
import {
  createUserEditorInitialState,
  editorDirectPolicy,
  userEditorDraftKey,
  type UserEditorDraft,
} from './user-editor-draft';

type UserEditorStep = 'account' | 'sources' | 'direct' | 'review';

const STEP_ORDER: readonly UserEditorStep[] = [
  'account',
  'sources',
  'direct',
  'review',
];

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
  const query = useQuery({
    queryKey: vaultQueryKeys.userEditor(reference.mount, reference.username),
    queryFn: ({ signal }) => loadUserLifecycleSnapshot(
      gateway,
      session,
      reference,
      signal,
    ),
  });
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
  const queryClient = useQueryClient();
  const workspace = useRef<AccessWorkspaceShellHandle>(null);
  const initial = useMemo(
    () => createUserEditorInitialState(snapshot, catalog),
    [catalog, snapshot],
  );
  const [draft, setDraft] = useState<UserEditorDraft>(initial.draft);
  const [step, setStep] = useState<UserEditorStep>('account');
  const [confirmation, setConfirmation] = useState('');
  const [progress, setProgress] = useState<Record<string, OperationRunState>>({});
  const [result, setResult] = useState<PlanExecutionResult>();
  const [applying, setApplying] = useState(false);
  const executorRef = useRef<ChangePlanExecutor | null>(null);
  const initialKey = userEditorDraftKey(initial.draft);
  const draftKey = userEditorDraftKey(draft);
  const dirty = draftKey !== initialKey;
  const managedRolePolicyNames = catalog.roles.flatMap(({ policyNames }) => policyNames);
  const errors = useMemo<readonly WorkspaceValidationError[]>(() => {
    const values: WorkspaceValidationError[] = [];
    if (
      snapshot.entity?.metadata?.managed_by === 'vault-console'
      && !draft.displayName.trim()
    ) {
      values.push({
        id: 'display-name',
        message: 'Display name is required for a managed Identity entity.',
        step: 'account',
        fieldId: 'user-display-name',
      });
    }
    return values;
  }, [draft.displayName, snapshot.entity?.metadata?.managed_by]);
  const displayNameError = errors.find(
    ({ fieldId }) => fieldId === 'user-display-name',
  )?.message;
  const directPolicy = editorDirectPolicy(
    snapshot,
    draft,
    initial.directPolicySupported,
  );
  const plan = useMemo(() => {
    try {
      return buildUserEditPlan(snapshot, {
        displayName: draft.displayName,
        groupIds: draft.groupIds,
        directRolePolicyNames: draft.directRoleIds,
        managedRolePolicyNames,
        directPolicy,
        adoptDirectPolicy: draft.adoptDirectPolicy,
      });
    } catch {
      return null;
    }
  }, [
    directPolicy,
    draft,
    managedRolePolicyNames,
    snapshot,
  ]);
  const confirmationValid = !plan?.confirmation?.required
    || confirmation === plan.confirmation.value;
  const canApply = Boolean(
    plan
    && plan.operations.length > 0
    && plan.visibility.complete
    && errors.length === 0
    && confirmationValid
    && !applying,
  );
  const steps: readonly WorkspaceStep[] = [
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
      description: 'Preflight and apply',
    },
  ];
  const stepIndex = STEP_ORDER.indexOf(step);
  const goTo = (next: string, fieldId?: string) => {
    setStep(next as UserEditorStep);
    if (fieldId) {
      requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
    }
  };
  const apply = async () => {
    if (!plan || !canApply) return;
    setApplying(true);
    setResult(undefined);
    executorRef.current = new ChangePlanExecutor({
      gateway,
      session,
      plan,
      loadFreshState: async (signal) => {
        const fresh = await loadUserLifecycleSnapshot(
          gateway,
          session,
          reference,
          signal,
        );
        return {
          fingerprint: fresh.fingerprint,
          visibility: fresh.visibility,
        };
      },
    });
    try {
      const execution = await executorRef.current.apply({
        confirmation,
        onProgress: (operationId, state) => {
          setProgress((current) => ({ ...current, [operationId]: state }));
        },
      });
      setResult(execution);
      if (execution.status === 'completed') {
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['vault', 'userpass-users'] }),
          queryClient.invalidateQueries({ queryKey: vaultQueryKeys.groups() }),
          queryClient.invalidateQueries({ queryKey: vaultQueryKeys.policies() }),
          queryClient.invalidateQueries({
            queryKey: vaultQueryKeys.policyRecords(),
          }),
          queryClient.invalidateQueries({
            queryKey: vaultQueryKeys.policyCatalogs(),
          }),
          queryClient.invalidateQueries({
            queryKey: vaultQueryKeys.userAccessAccount(reference.mount, reference.username),
          }),
          queryClient.invalidateQueries({
            queryKey: vaultQueryKeys.userAccessIdentity(reference.mount, reference.username),
          }),
          queryClient.invalidateQueries({
            queryKey: vaultQueryKeys.userAccessGroups(reference.mount, reference.username),
          }),
        ]);
        workspace.current?.allowNextNavigation();
        onDone();
      }
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired') {
        workspace.current?.allowNextNavigation();
        onSessionExpired?.();
      }
      setResult({
        status: 'partial',
        operations: [],
        recovery: [],
        errorMessage: error.message,
      });
    } finally {
      setApplying(false);
    }
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
        <>
          <span className="hidden font-mono text-[9px] text-foreground-400 sm:block">
            {dirty ? `${plan?.operations.length ?? 0} staged Vault changes` : 'No draft changes'}
          </span>
          <div className="ml-auto flex items-center gap-2">
            {stepIndex > 0 && (
              <Button
                type="button"
                size="sm"
                onClick={() => setStep(STEP_ORDER[stepIndex - 1])}
              >
                <i className="ri-arrow-left-line" aria-hidden="true" /> Back
              </Button>
            )}
            {step !== 'review' ? (
              <Button
                type="button"
                variant="primary"
                size="sm"
                onClick={() => {
                  if (errors.length > 0 && step === 'account') return;
                  setStep(STEP_ORDER[stepIndex + 1]);
                }}
                disabled={errors.length > 0 && step === 'account'}
              >
                Continue <i className="ri-arrow-right-line" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="button"
                variant="primary"
                size="sm"
                loading={applying}
                disabled={!canApply}
                onClick={() => { void apply(); }}
              >
                Apply {plan?.operations.length ?? 0} change{plan?.operations.length === 1 ? '' : 's'}
              </Button>
            )}
          </div>
        </>
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
        <div className="space-y-4">
          <AccessReview
            plan={plan}
            confirmation={confirmation}
            onConfirmationChange={setConfirmation}
          />
          {Object.keys(progress).length > 0 && (
            <section aria-live="polite" className="rounded-lg border border-background-300 bg-background-50 p-3">
              <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.12em] text-foreground-400">
                Apply progress
              </p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {Object.entries(progress).map(([operationId, state]) => (
                  <span key={operationId} className="rounded-sm bg-background-100 px-2 py-1 font-mono text-[9px] text-foreground-600">
                    {operationId}: {state}
                  </span>
                ))}
              </div>
            </section>
          )}
          <PlanExecutionNotice result={result} />
        </div>
      )}
      {step === 'review' && !plan && (
        <div role="alert" className="rounded-lg border border-danger-300 bg-danger-50 p-4 text-xs text-danger-900">
          This draft cannot be represented as a safe Vault change plan.
        </div>
      )}
    </AccessWorkspaceShell>
  );
}
