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
  buildAdoptRolePlan,
  buildCreateRolePlan,
  buildUpdateRolePlan,
  loadRoleLifecycleSnapshot,
} from '@/application/vault/access-lifecycle/role-lifecycle';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import type {
  OperationRunState,
  PlanExecutionResult,
  RoleLifecycleSnapshot,
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
import RoleDependenciesStep from './RoleDependenciesStep';
import RoleKvAccessStep from './RoleKvAccessStep';
import RoleOverviewStep from './RoleOverviewStep';
import {
  initialRoleEditorState,
  roleDraftHcl,
  roleEditorDraftKey,
  type RoleEditorDraft as RoleEditorDraftState,
} from './role-editor-draft';

export type RoleEditorMode = 'create' | 'edit' | 'adopt';
type RoleEditorStep = 'overview' | 'kv' | 'dependencies' | 'review';
const STEP_ORDER: readonly RoleEditorStep[] = [
  'overview',
  'kv',
  'dependencies',
  'review',
];
const ROLE_NAME_PATTERN = /^vc-role-[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/;

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
  const query = useQuery({
    queryKey: vaultQueryKeys.roleEditor(policyName ?? 'new'),
    queryFn: ({ signal }) => loadRoleLifecycleSnapshot(
      gateway,
      session,
      policyName,
      signal,
    ),
  });
  if (query.isPending || !query.data) {
    return <ContentSkeleton label="Loading the role workspace" variant="workspace" />;
  }
  if (query.isError) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-5 text-center">
        <p role="alert" className="text-sm font-semibold text-warning-900">
          The role workspace could not be loaded.
        </p>
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" onClick={() => { void query.refetch(); }}>Retry</Button>
          <Button type="button" size="sm" onClick={onClose}>Back</Button>
        </div>
      </div>
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
  const workspace = useRef<AccessWorkspaceShellHandle>(null);
  const initial = useMemo(
    () => initialRoleEditorState(snapshot, catalog),
    [catalog, snapshot],
  );
  const [draft, setDraft] = useState<RoleEditorDraftState>(initial.draft);
  const [step, setStep] = useState<RoleEditorStep>('overview');
  const [confirmation, setConfirmation] = useState('');
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<Record<string, OperationRunState>>({});
  const [result, setResult] = useState<PlanExecutionResult>();
  const dirty = mode === 'adopt'
    || roleEditorDraftKey(draft) !== roleEditorDraftKey(initial.draft);
  const errors = useMemo<readonly WorkspaceValidationError[]>(() => {
    const values: WorkspaceValidationError[] = [];
    if (!ROLE_NAME_PATTERN.test(draft.policyName)) {
      values.push({
        id: 'role-name',
        message: 'Use lowercase letters, digits, and single hyphens for the role identifier.',
        step: 'overview',
        fieldId: 'role-slug',
      });
    }
    if (!initial.visualSupported) {
      values.push({
        id: 'role-visual',
        message: 'The complete policy cannot be represented by canonical visual KV rules.',
        step: 'kv',
      });
    }
    if (mode !== 'adopt' && draft.directRules.length === 0) {
      values.push({
        id: 'role-rules',
        message: 'Add at least one KV access target.',
        step: 'kv',
      });
    }
    return values;
  }, [draft.directRules.length, draft.policyName, initial.visualSupported, mode]);
  const roleNameError = errors.find(({ fieldId }) => fieldId === 'role-slug')?.message;
  const plan = useMemo(() => {
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
  }, [draft, mode, snapshot]);
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
      description: 'Identifier and description',
      complete: step !== 'overview' && !errors.some(({ step: errorStep }) => errorStep === 'overview'),
      invalid: errors.some(({ step: errorStep }) => errorStep === 'overview'),
    },
    {
      id: 'kv',
      label: 'KV access',
      description: 'Canonical visual policy',
      complete: ['dependencies', 'review'].includes(step),
      invalid: errors.some(({ step: errorStep }) => errorStep === 'kv'),
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
      description: 'Diff, preflight, apply',
    },
  ];
  const stepIndex = STEP_ORDER.indexOf(step);
  const goTo = (next: string, fieldId?: string) => {
    setStep(next as RoleEditorStep);
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
      }).apply({
        confirmation,
        onProgress: (operationId, state) => {
          setProgress((current) => ({ ...current, [operationId]: state }));
        },
      });
      setResult(execution);
      if (execution.status === 'completed') {
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
        workspace.current?.allowNextNavigation();
        onDone(draft.policyName);
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
      eyebrow={mode === 'create'
        ? 'New managed role'
        : mode === 'adopt'
          ? 'Role adoption'
          : 'Role policy change'}
      title={mode === 'create' ? 'Create role' : snapshot.policy?.name ?? 'Role'}
      subtitle={draft.policyName || 'sys/policies/acl/vc-role-*'}
      steps={steps}
      activeStep={step}
      onStepChange={goTo}
      onClose={onClose}
      dirty={dirty && result?.status !== 'completed'}
      stateLabel={applying ? 'Applying' : mode === 'adopt' ? 'Adoption' : 'Draft'}
      footer={(
        <>
          <span className="hidden font-mono text-[9px] text-foreground-400 sm:block">
            {mode === 'adopt'
              ? 'Capabilities remain unchanged'
              : dirty
                ? `${draft.directRules.length} visual target${draft.directRules.length === 1 ? '' : 's'}`
                : 'No draft changes'}
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
                disabled={errors.some(({ step: errorStep }) => errorStep === step)}
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
                {mode === 'create' ? 'Create role' : mode === 'adopt' ? 'Adopt role' : 'Apply role change'}
              </Button>
            )}
          </div>
        </>
      )}
    >
      <WorkspaceErrorSummary errors={errors} onNavigate={goTo} />
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
      {step === 'review' && plan && (
        <div className="space-y-4">
          <AccessReview
            plan={plan}
            confirmation={confirmation}
            onConfirmationChange={setConfirmation}
          />
          {mode !== 'create' && snapshot.policy && (
            <details className="rounded-lg border border-background-300 bg-background-50">
              <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-foreground-700">
                Before / after HCL
              </summary>
              <div className="grid gap-3 border-t border-background-200 p-3 lg:grid-cols-2">
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-background-100 p-3 font-mono text-[9px] text-foreground-600">
                  {snapshot.policy.policy}
                </pre>
                <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-background-100 p-3 font-mono text-[9px] text-foreground-600">
                  {plan.operations[0]?.kind === 'write-policy'
                    ? plan.operations[0].policy.policy
                    : snapshot.policy.policy}
                </pre>
              </div>
            </details>
          )}
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
          This role draft cannot be represented as a safe Vault change plan.
        </div>
      )}
    </AccessWorkspaceShell>
  );
}
