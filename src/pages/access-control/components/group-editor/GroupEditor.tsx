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
import { ChangePlanExecutor } from '@/application/vault/access-lifecycle/change-plan-executor';
import {
  buildCreateGroupPlan,
  buildUpdateGroupPlan,
  loadGroupLifecycleSnapshot,
} from '@/application/vault/access-lifecycle/group-lifecycle';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import type {
  OperationRunState,
  PlanExecutionResult,
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
import GroupMembersStep from './GroupMembersStep';
import GroupOverviewStep from './GroupOverviewStep';
import GroupRolesStep from './GroupRolesStep';
import {
  groupEditorDraftKey,
  initialGroupEditorDraft,
  toGroupDraft,
  type GroupEditorDraft as GroupEditorDraftState,
} from './group-editor-draft';

type GroupEditorStep = 'overview' | 'members' | 'roles' | 'review';
const STEP_ORDER: readonly GroupEditorStep[] = [
  'overview',
  'members',
  'roles',
  'review',
];

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
  const query = useQuery({
    queryKey: vaultQueryKeys.groupEditor(groupId ?? 'new'),
    queryFn: ({ signal }) => loadGroupLifecycleSnapshot(
      gateway,
      session,
      groupId,
      signal,
    ),
  });
  if (query.isPending || !query.data) {
    return <ContentSkeleton label="Loading the group workspace" variant="workspace" />;
  }
  if (query.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-5 text-center">
        <p role="alert" className="text-sm font-semibold text-warning-900">
          The group workspace could not be loaded.
        </p>
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" onClick={() => { void query.refetch(); }}>Retry</Button>
          <Button type="button" size="sm" onClick={onClose}>Back</Button>
        </div>
      </div>
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
  const workspace = useRef<AccessWorkspaceShellHandle>(null);
  const initial = useMemo(
    () => initialGroupEditorDraft(snapshot, catalog),
    [catalog, snapshot],
  );
  const [draft, setDraft] = useState<GroupEditorDraftState>(initial);
  const [step, setStep] = useState<GroupEditorStep>('overview');
  const [confirmation, setConfirmation] = useState('');
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<Record<string, OperationRunState>>({});
  const [result, setResult] = useState<PlanExecutionResult>();
  const dirty = groupEditorDraftKey(draft) !== groupEditorDraftKey(initial);
  const errors = useMemo<readonly WorkspaceValidationError[]>(() => {
    const values: WorkspaceValidationError[] = [];
    if (!draft.name.trim()) {
      values.push({
        id: 'group-name-required',
        message: 'Group name is required.',
        step: 'overview',
        fieldId: 'group-name',
      });
    }
    return values;
  }, [draft.name]);
  const groupNameError = errors.find(({ fieldId }) => fieldId === 'group-name')?.message;
  const domainDraft = useMemo(
    () => toGroupDraft(snapshot, draft, catalog),
    [catalog, draft, snapshot],
  );
  const plan = useMemo(() => {
    try {
      return groupId
        ? buildUpdateGroupPlan(snapshot, domainDraft)
        : buildCreateGroupPlan(snapshot, domainDraft);
    } catch {
      return null;
    }
  }, [domainDraft, groupId, snapshot]);
  const confirmationValid = !plan?.confirmation?.required
    || confirmation === plan.confirmation.value;
  const canApply = Boolean(
    plan
    && dirty
    && plan.visibility.complete
    && errors.length === 0
    && confirmationValid
    && !applying,
  );
  const steps: readonly WorkspaceStep[] = [
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
  const stepIndex = STEP_ORDER.indexOf(step);
  const goTo = (next: string, fieldId?: string) => {
    setStep(next as GroupEditorStep);
    if (fieldId) {
      requestAnimationFrame(() => document.getElementById(fieldId)?.focus());
    }
  };
  const apply = async () => {
    if (!plan || !canApply) return;
    setApplying(true);
    setResult(undefined);
    try {
      const execution = await new ChangePlanExecutor({
        gateway,
        session,
        plan,
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
      }).apply({
        confirmation,
        onProgress: (operationId, state) => {
          setProgress((current) => ({ ...current, [operationId]: state }));
        },
      });
      setResult(execution);
      if (execution.status === 'completed') {
        const createdId = execution.operations.find(
          ({ operationId }) => operationId === 'create-group',
        )?.resourceId;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: vaultQueryKeys.groups() }),
          queryClient.invalidateQueries({
            queryKey: vaultQueryKeys.groupEditor(groupId ?? 'new'),
          }),
        ]);
        const resolvedId = groupId ?? createdId;
        if (!resolvedId) throw new Error('Vault did not return the created group ID.');
        workspace.current?.allowNextNavigation();
        onDone(resolvedId);
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
      eyebrow={groupId ? 'Group access change' : 'New managed group'}
      title={groupId ? snapshot.group?.name ?? 'Managed group' : 'Create group'}
      subtitle={groupId ? `identity/group/id/${groupId}` : 'identity/group'}
      steps={steps}
      activeStep={step}
      onStepChange={goTo}
      onClose={onClose}
      dirty={dirty && result?.status !== 'completed'}
      stateLabel={applying ? 'Applying' : groupId ? 'Draft' : 'New'}
      footer={(
        <>
          <span className="hidden font-mono text-[9px] text-foreground-400 sm:block">
            {dirty ? '1 staged Vault operation' : 'No draft changes'}
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
                size="sm"
                variant="primary"
                disabled={step === 'overview' && errors.length > 0}
                onClick={() => setStep(STEP_ORDER[stepIndex + 1])}
              >
                Continue <i className="ri-arrow-right-line" aria-hidden="true" />
              </Button>
            ) : (
              <Button
                type="button"
                size="sm"
                variant="primary"
                loading={applying}
                disabled={!canApply}
                onClick={() => { void apply(); }}
              >
                {groupId ? 'Apply group change' : 'Create group'}
              </Button>
            )}
          </div>
        </>
      )}
    >
      <WorkspaceErrorSummary errors={errors} onNavigate={goTo} />
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
      {step === 'review' && plan && (
        <div className="space-y-4">
          <AccessReview
            plan={plan}
            confirmation={confirmation}
            onConfirmationChange={setConfirmation}
          />
          {Object.keys(progress).length > 0 && (
            <div aria-live="polite" className="rounded-md border border-background-300 bg-background-50 p-3 font-mono text-[9px] text-foreground-500">
              {Object.entries(progress).map(([id, state]) => (
                <p key={id}>{id}: {state}</p>
              ))}
            </div>
          )}
          <PlanExecutionNotice result={result} />
        </div>
      )}
      {step === 'review' && !plan && (
        <div role="alert" className="rounded-md border border-danger-300 bg-danger-50 p-3 text-xs text-danger-900">
          This group draft cannot be represented as a safe Vault plan.
        </div>
      )}
    </AccessWorkspaceShell>
  );
}
