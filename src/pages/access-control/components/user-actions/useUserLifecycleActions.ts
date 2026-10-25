import {
  useMemo,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  usePlanCapabilities,
  useSessionExpiryFromErrors,
  useUserLifecycleSnapshot,
} from '@/application/vault/access-lifecycle/lifecycle-queries';
import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import { ChangePlanExecutor } from '@/application/vault/access-lifecycle/change-plan-executor';
import {
  buildResetPasswordPlan,
  buildToggleEntityPlan,
  buildUserRemovalPlan,
  loadUserLifecycleSnapshot,
  type UserLifecycleRef,
  type UserRemovalPlan,
} from '@/application/vault/access-lifecycle/user-lifecycle';
import {
  identityEntityFingerprint,
  userpassAccountFingerprint,
} from '@/application/vault/access-lifecycle/snapshot-normalization';
import { generateSecurePassword } from '@/domain/access-control/password';
import {
  capabilityRequirementsSatisfied,
  requiredCapabilities,
} from '@/domain/access-control/lifecycle/change-plan';
import type {
  CapabilityRequirement,
  ChangePlan,
  PlanExecutionResult,
  UserLifecycleSnapshot,
} from '@/domain/access-control/lifecycle/model';
import type {
  VaultAccessControlGateway,
  VaultCapabilityMap,
  VaultSession,
} from '@/domain/vault/contracts';
import { vaultPassword } from '@/domain/vault/sensitive-value';

export type ActionPanel = 'menu' | 'password' | 'password-success' | 'toggle' | 'remove';
export type PasswordMode = 'generated' | 'manual';

interface FreshPlanState {
  readonly fingerprint: string;
  readonly visibility: UserLifecycleSnapshot['visibility'];
}

interface LifecycleContext {
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
}

function planAllowed(
  plan: ChangePlan | undefined,
  capabilities: VaultCapabilityMap | undefined,
): boolean {
  if (!plan || !capabilities) return false;
  return capabilityRequirementsSatisfied(
    requiredCapabilities(plan.operations),
    capabilities,
  ).allowed;
}

async function loadAccountFreshState(
  { gateway, session }: LifecycleContext,
  reference: UserLifecycleRef,
): Promise<FreshPlanState> {
  const fresh = await gateway.readUserpassAccount(
    session,
    reference.mount,
    reference.username,
  );
  if (!fresh) throw new Error('The userpass account no longer exists.');
  return {
    fingerprint: userpassAccountFingerprint(fresh),
    visibility: { complete: true, reasons: [] },
  };
}

function isSessionExpired(cause: unknown): boolean {
  return typeof cause === 'object'
    && cause !== null
    && 'code' in cause
    && cause.code === 'session-expired';
}

function useLifecyclePlans(
  context: LifecycleContext,
  reference: UserLifecycleRef,
  enabled: boolean,
) {
  const snapshotQuery = useUserLifecycleSnapshot(context, reference, { enabled });
  const snapshot = snapshotQuery.data;
  const togglePlan = useMemo(() => {
    if (!snapshot?.entity || snapshot.entity.metadata?.managed_by !== 'vault-console') {
      return undefined;
    }
    return buildToggleEntityPlan(snapshot, !snapshot.entity.disabled);
  }, [snapshot]);
  const removal = useMemo<UserRemovalPlan | undefined>(
    () => snapshot ? buildUserRemovalPlan(snapshot) : undefined,
    [snapshot],
  );
  const resetRequirements = useMemo<readonly CapabilityRequirement[]>(
    () => snapshot ? [{
      path: `auth/${snapshot.account.mount}/users/${
        encodeURIComponent(snapshot.account.username)
      }/password`,
      anyOf: ['update'],
    }] : [],
    [snapshot],
  );
  const capabilityPaths = useMemo(
    () => [...new Set([
      ...resetRequirements.map(({ path }) => path),
      ...requiredCapabilities(togglePlan?.operations ?? []).map(({ path }) => path),
      ...requiredCapabilities(removal?.plan.operations ?? []).map(({ path }) => path),
    ])].sort(),
    [removal, resetRequirements, togglePlan],
  );
  const capabilityQuery = usePlanCapabilities(context, capabilityPaths);
  const resetAllowed = Boolean(
    snapshot
    && capabilityQuery.data
    && capabilityRequirementsSatisfied(resetRequirements, capabilityQuery.data).allowed,
  );
  return {
    snapshotQuery,
    snapshot,
    togglePlan,
    removal,
    capabilityQuery,
    resetAllowed,
    toggleAllowed: planAllowed(togglePlan, capabilityQuery.data),
    removalAllowed: planAllowed(removal?.plan, capabilityQuery.data),
    capabilitiesPending: snapshotQuery.isPending || capabilityQuery.isPending,
  };
}

function useLifecyclePlanRunner(
  { gateway, session }: LifecycleContext,
  onSessionExpired: (() => void) | undefined,
) {
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<PlanExecutionResult>();

  const applyPlan = async (
    plan: ChangePlan,
    confirmation: string,
    loadFreshState: () => Promise<FreshPlanState>,
  ) => {
    setApplying(true);
    setResult(undefined);
    try {
      const execution = await new ChangePlanExecutor({
        gateway,
        session,
        plan,
        loadFreshState,
      }).apply({ confirmation });
      setResult(execution);
      return execution;
    } catch (cause) {
      if (isSessionExpired(cause)) onSessionExpired?.();
      const failed: PlanExecutionResult = {
        status: 'partial',
        operations: [],
        recovery: [],
        errorMessage: 'Vault did not confirm the requested lifecycle change.',
      };
      setResult(failed);
      return failed;
    } finally {
      setApplying(false);
    }
  };
  const resetRun = () => {
    setResult(undefined);
    setApplying(false);
  };

  return { applying, result, applyPlan, resetRun };
}

function useInvalidateUser(reference: UserLifecycleRef) {
  const queryClient = useQueryClient();
  return async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: vaultQueryKeys.userEditor(reference.mount, reference.username),
      }),
      queryClient.invalidateQueries({ queryKey: vaultQueryKeys.allUserpassUsers() }),
      queryClient.invalidateQueries({ queryKey: vaultQueryKeys.groups() }),
      queryClient.invalidateQueries({
        queryKey: vaultQueryKeys.userAccessAccount(reference.mount, reference.username),
      }),
      queryClient.invalidateQueries({
        queryKey: vaultQueryKeys.userAccessIdentity(reference.mount, reference.username),
      }),
      queryClient.invalidateQueries({
        queryKey: vaultQueryKeys.userAccessGroups(reference.mount, reference.username),
      }),
      queryClient.invalidateQueries({ queryKey: vaultQueryKeys.identityTombstones() }),
    ]);
  };
}

interface UserLifecycleActionsInput {
  readonly reference: UserLifecycleRef;
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly onChanged: () => void;
  readonly onRemoved: (tombstoneEntityId?: string) => void;
  readonly onSessionExpired?: () => void;
}

export function useUserLifecycleActions({
  reference,
  gateway,
  session,
  onChanged,
  onRemoved,
  onSessionExpired,
}: UserLifecycleActionsInput) {
  const context = { gateway, session };
  const [panel, setPanel] = useState<ActionPanel>();
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('generated');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const plans = useLifecyclePlans(context, reference, Boolean(panel));
  const runner = useLifecyclePlanRunner(context, onSessionExpired);
  const invalidateUser = useInvalidateUser(reference);
  const {
    snapshot,
    togglePlan,
    removal,
    resetAllowed,
    toggleAllowed,
    removalAllowed,
  } = plans;

  useSessionExpiryFromErrors(
    onSessionExpired,
    plans.snapshotQuery.error,
    plans.capabilityQuery.error,
  );

  const clearTransient = () => {
    setPassword('');
    setConfirmation('');
    runner.resetRun();
  };
  const close = () => {
    setPanel(undefined);
    clearTransient();
  };
  const openPanel = (next: ActionPanel) => {
    clearTransient();
    setPanel(next);
  };
  const openPassword = () => {
    clearTransient();
    setPasswordMode('generated');
    setPassword(generateSecurePassword());
    setPanel('password');
  };
  const selectPasswordMode = (mode: PasswordMode) => {
    setPasswordMode(mode);
    setPassword(mode === 'generated' ? generateSecurePassword() : '');
  };
  const regeneratePassword = () => setPassword(generateSecurePassword());

  const resetPassword = async () => {
    if (!snapshot || !resetAllowed || password.length < 16) return;
    const plan = buildResetPasswordPlan(snapshot, vaultPassword(password));
    const execution = await runner.applyPlan(
      plan,
      confirmation,
      () => loadAccountFreshState(context, reference),
    );
    if (execution.status === 'completed') {
      await invalidateUser();
      setPanel('password-success');
    }
  };
  const toggleIdentity = async () => {
    if (!snapshot?.entity || !togglePlan || !toggleAllowed) return;
    const entityId = snapshot.entity.id;
    const execution = await runner.applyPlan(togglePlan, confirmation, async () => {
      const fresh = await gateway.readEntity(session, entityId);
      return {
        fingerprint: identityEntityFingerprint(fresh),
        visibility: { complete: true, reasons: [] },
      };
    });
    if (execution.status === 'completed') {
      await invalidateUser();
      close();
      onChanged();
    }
  };
  const removeLogin = async () => {
    if (!snapshot || !removal || !removalAllowed) return;
    const execution = await runner.applyPlan(removal.plan, confirmation, async () => {
      if (removal.mode === 'managed-tombstone') {
        const fresh = await loadUserLifecycleSnapshot(gateway, session, reference);
        return { fingerprint: fresh.fingerprint, visibility: fresh.visibility };
      }
      return loadAccountFreshState(context, reference);
    });
    if (execution.status === 'completed') {
      const tombstoneId = removal.mode === 'managed-tombstone'
        ? snapshot.entity?.id
        : undefined;
      await invalidateUser();
      close();
      onRemoved(tombstoneId);
    }
  };

  return {
    ...plans,
    panel,
    setPanel,
    passwordMode,
    password,
    setPassword,
    confirmation,
    setConfirmation,
    applying: runner.applying,
    result: runner.result,
    close,
    backToMenu: () => openPanel('menu'),
    openPanel,
    openPassword,
    selectPasswordMode,
    regeneratePassword,
    resetPassword,
    toggleIdentity,
    removeLogin,
  };
}
