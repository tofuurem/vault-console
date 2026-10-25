import {
  useRef,
  useState,
  type RefObject,
} from 'react';

import {
  ChangePlanExecutor,
  type FreshPlanState,
} from '@/application/vault/access-lifecycle/change-plan-executor';
import type {
  ChangePlan,
  OperationRunState,
  PlanExecutionResult,
} from '@/domain/access-control/lifecycle/model';
import type {
  VaultAccessControlGateway,
  VaultSession,
} from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';
import type { AccessWorkspaceShellHandle } from './AccessWorkspaceShell';
import type { WorkspaceValidationError } from './WorkspaceErrorSummary';

interface PlanApplyWorkflowInput {
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly onSessionExpired?: () => void;
}

interface PlanApplyRun {
  readonly loadFreshState: (signal?: AbortSignal) => Promise<FreshPlanState>;
  readonly onCompleted: (execution: PlanExecutionResult) => Promise<void>;
}

export interface PlanApplyWorkflow {
  readonly workspace: RefObject<AccessWorkspaceShellHandle | null>;
  readonly confirmation: string;
  readonly setConfirmation: (value: string) => void;
  readonly applying: boolean;
  readonly progress: Readonly<Record<string, OperationRunState>>;
  readonly result: PlanExecutionResult | undefined;
  readonly run: (plan: ChangePlan, input: PlanApplyRun) => Promise<void>;
}

export function canApplyPlan(
  plan: ChangePlan | null,
  {
    dirty,
    errors,
    confirmation,
    applying,
  }: {
    readonly dirty: boolean;
    readonly errors: readonly WorkspaceValidationError[];
    readonly confirmation: string;
    readonly applying: boolean;
  },
): boolean {
  const confirmationValid = !plan?.confirmation?.required
    || confirmation === plan.confirmation.value;
  return Boolean(
    plan
    && dirty
    && plan.visibility.complete
    && errors.length === 0
    && confirmationValid
    && !applying,
  );
}

/** Executes a reviewed workspace plan, tracking per-operation progress and the final result. */
export function usePlanApplyWorkflow({
  gateway,
  session,
  onSessionExpired,
}: PlanApplyWorkflowInput): PlanApplyWorkflow {
  const workspace = useRef<AccessWorkspaceShellHandle>(null);
  const [confirmation, setConfirmation] = useState('');
  const [applying, setApplying] = useState(false);
  const [progress, setProgress] = useState<Record<string, OperationRunState>>({});
  const [result, setResult] = useState<PlanExecutionResult>();

  const run = async (plan: ChangePlan, { loadFreshState, onCompleted }: PlanApplyRun) => {
    setApplying(true);
    setResult(undefined);
    try {
      const execution = await new ChangePlanExecutor({
        gateway,
        session,
        plan,
        loadFreshState,
      }).apply({
        confirmation,
        onProgress: (operationId, state) => {
          setProgress((current) => ({ ...current, [operationId]: state }));
        },
      });
      setResult(execution);
      if (execution.status === 'completed') await onCompleted(execution);
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

  return {
    workspace,
    confirmation,
    setConfirmation,
    applying,
    progress,
    result,
    run,
  };
}
