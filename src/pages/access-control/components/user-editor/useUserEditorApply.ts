import {
  useRef,
  useState,
  type RefObject,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import {
  ChangePlanExecutor,
} from '@/application/vault/access-lifecycle/change-plan-executor';
import {
  loadUserLifecycleSnapshot,
  type UserLifecycleRef,
} from '@/application/vault/access-lifecycle/user-lifecycle';
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
import type { AccessWorkspaceShellHandle } from '../workspace/AccessWorkspaceShell';

interface UserEditorApplyInput {
  readonly reference: UserLifecycleRef;
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly workspace: RefObject<AccessWorkspaceShellHandle | null>;
  readonly onDone: () => void;
  readonly onSessionExpired?: () => void;
}

export function useUserEditorApply({
  reference,
  gateway,
  session,
  workspace,
  onDone,
  onSessionExpired,
}: UserEditorApplyInput) {
  const queryClient = useQueryClient();
  const [progress, setProgress] = useState<Record<string, OperationRunState>>({});
  const [result, setResult] = useState<PlanExecutionResult>();
  const [applying, setApplying] = useState(false);
  const executorRef = useRef<ChangePlanExecutor | null>(null);

  const invalidateUser = () => Promise.all([
    queryClient.invalidateQueries({ queryKey: vaultQueryKeys.allUserpassUsers() }),
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

  const apply = async (plan: ChangePlan, confirmation: string) => {
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
        await invalidateUser();
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

  return { apply, applying, progress, result };
}
