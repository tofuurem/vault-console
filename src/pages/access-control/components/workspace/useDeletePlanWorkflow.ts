import {
  useMemo,
  useState,
} from 'react';

import { usePlanCapabilities } from '@/application/vault/access-lifecycle/lifecycle-queries';
import {
  ChangePlanExecutor,
  type FreshPlanState,
} from '@/application/vault/access-lifecycle/change-plan-executor';
import {
  capabilityRequirementsSatisfied,
  requiredCapabilities,
} from '@/domain/access-control/lifecycle/change-plan';
import type {
  ChangePlan,
  PlanExecutionResult,
} from '@/domain/access-control/lifecycle/model';
import type {
  VaultAccessControlGateway,
  VaultSession,
} from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';

interface DeletePlanWorkflowInput<TSnapshot> {
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly snapshot: TSnapshot | undefined;
  readonly buildPlan: (snapshot: TSnapshot) => ChangePlan;
  readonly loadFreshState: (signal?: AbortSignal) => Promise<FreshPlanState>;
  readonly onCompleted: () => Promise<void>;
  readonly onSessionExpired?: () => void;
}

export interface DeletePlanWorkflow {
  readonly plan: ChangePlan | undefined;
  readonly allowed: boolean;
  readonly capabilitiesError: unknown;
  readonly dialogOpen: boolean;
  readonly openDialog: () => void;
  readonly closeDialog: () => void;
  readonly deleting: boolean;
  readonly result: PlanExecutionResult | undefined;
  readonly execute: (confirmation?: string) => Promise<void>;
}

function useDeletePlan<TSnapshot>(
  snapshot: TSnapshot | undefined,
  buildPlan: (snapshot: TSnapshot) => ChangePlan,
) {
  return useMemo(() => {
    if (!snapshot) return undefined;
    try {
      return buildPlan(snapshot);
    } catch {
      return undefined;
    }
  }, [buildPlan, snapshot]);
}

/** Delete plan for a loaded snapshot, gated by a capability preflight of the paths it touches. */
export function useDeletePlanWorkflow<TSnapshot>({
  gateway,
  session,
  snapshot,
  buildPlan,
  loadFreshState,
  onCompleted,
  onSessionExpired,
}: DeletePlanWorkflowInput<TSnapshot>): DeletePlanWorkflow {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<PlanExecutionResult>();
  const plan = useDeletePlan(snapshot, buildPlan);
  const requirements = useMemo(
    () => requiredCapabilities(plan?.operations ?? []),
    [plan],
  );
  const paths = useMemo(() => requirements.map(({ path }) => path), [requirements]);
  const capabilities = usePlanCapabilities({ gateway, session }, paths);
  const allowed = Boolean(
    plan
    && capabilities.data
    && capabilityRequirementsSatisfied(requirements, capabilities.data).allowed,
  );

  const execute = async (confirmation?: string) => {
    if (!plan || !allowed) return;
    setDeleting(true);
    setResult(undefined);
    try {
      const execution = await new ChangePlanExecutor({
        gateway,
        session,
        plan,
        loadFreshState,
      }).apply({ confirmation });
      setResult(execution);
      if (execution.status === 'completed') await onCompleted();
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired') onSessionExpired?.();
      setResult({
        status: 'partial',
        operations: [],
        recovery: [],
        errorMessage: error.message,
      });
    } finally {
      setDeleting(false);
    }
  };

  return {
    plan,
    allowed,
    capabilitiesError: capabilities.error,
    dialogOpen,
    openDialog: () => setDialogOpen(true),
    closeDialog: () => setDialogOpen(false),
    deleting,
    result,
    execute,
  };
}
