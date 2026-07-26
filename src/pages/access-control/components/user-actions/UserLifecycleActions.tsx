import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';

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
import Button from '@/components/base/Button';
import Modal from '@/components/base/Modal';
import {
  assessPassword,
  generateSecurePassword,
} from '@/domain/access-control/password';
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
import { normalizeVaultError } from '@/domain/vault/errors';
import {
  vaultPassword,
} from '@/domain/vault/sensitive-value';
import AccessReview from '../workspace/AccessReview';
import PlanExecutionNotice from '../workspace/PlanExecutionNotice';
import PasswordHandoff from '../create-user/PasswordHandoff';

type ActionPanel = 'menu' | 'password' | 'password-success' | 'toggle' | 'remove';
type PasswordMode = 'generated' | 'manual';

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

function ActionChoice({
  icon,
  title,
  description,
  tone = 'normal',
  disabled,
  disabledReason,
  onClick,
}: {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly tone?: 'normal' | 'danger';
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly onClick: () => void;
}) {
  return (
    <div className="rounded-lg border border-background-300 bg-background-50 p-3">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
          tone === 'danger'
            ? 'bg-danger-100 text-danger-700'
            : 'bg-primary-100 text-primary-700'
        }`}>
          <i className={icon} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground-900">{title}</p>
          <p className="mt-0.5 text-[10px] leading-4 text-foreground-500">{description}</p>
          {disabled && disabledReason && (
            <p className="mt-1 text-[9px] leading-4 text-warning-700">{disabledReason}</p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant={tone === 'danger' ? 'danger' : 'secondary'}
          disabled={disabled}
          onClick={onClick}
        >
          Open
        </Button>
      </div>
    </div>
  );
}

interface UserLifecycleActionsProps {
  readonly reference: UserLifecycleRef;
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly onChanged: () => void;
  readonly onRemoved: (tombstoneEntityId?: string) => void;
  readonly onSessionExpired?: () => void;
}

export default function UserLifecycleActions({
  reference,
  gateway,
  session,
  onChanged,
  onRemoved,
  onSessionExpired,
}: UserLifecycleActionsProps) {
  const queryClient = useQueryClient();
  const [panel, setPanel] = useState<ActionPanel>();
  const [passwordMode, setPasswordMode] = useState<PasswordMode>('generated');
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<PlanExecutionResult>();

  const snapshotQuery = useQuery({
    queryKey: vaultQueryKeys.userEditor(reference.mount, reference.username),
    queryFn: ({ signal }) => loadUserLifecycleSnapshot(
      gateway,
      session,
      reference,
      signal,
    ),
    enabled: Boolean(panel),
  });
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
  const capabilityQuery = useQuery({
    queryKey: vaultQueryKeys.accessPlanCapabilities(capabilityPaths),
    queryFn: ({ signal }) => gateway.getCapabilities(session, capabilityPaths, signal),
    enabled: capabilityPaths.length > 0,
  });
  const resetAllowed = Boolean(
    snapshot
    && capabilityQuery.data
    && capabilityRequirementsSatisfied(resetRequirements, capabilityQuery.data).allowed,
  );
  const toggleAllowed = planAllowed(togglePlan, capabilityQuery.data);
  const removalAllowed = planAllowed(removal?.plan, capabilityQuery.data);
  const capabilitiesPending = snapshotQuery.isPending || capabilityQuery.isPending;
  const passwordStrength = assessPassword(password);

  useEffect(() => {
    const cause = snapshotQuery.error ?? capabilityQuery.error;
    if (cause && normalizeVaultError(cause).code === 'session-expired') {
      onSessionExpired?.();
    }
  }, [capabilityQuery.error, onSessionExpired, snapshotQuery.error]);

  const clearTransient = () => {
    setPassword('');
    setConfirmation('');
    setResult(undefined);
    setApplying(false);
  };
  const close = () => {
    setPanel(undefined);
    clearTransient();
  };
  const backToMenu = () => {
    clearTransient();
    setPanel('menu');
  };
  const openPassword = () => {
    clearTransient();
    setPasswordMode('generated');
    setPassword(generateSecurePassword());
    setPanel('password');
  };
  const invalidateUser = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: vaultQueryKeys.userEditor(reference.mount, reference.username),
      }),
      queryClient.invalidateQueries({ queryKey: ['vault', 'userpass-users'] }),
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
  const applyPlan = async (
    plan: ChangePlan,
    loadFreshState: () => Promise<{
      readonly fingerprint: string;
      readonly visibility: UserLifecycleSnapshot['visibility'];
    }>,
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
      if (
        typeof cause === 'object'
        && cause
        && 'code' in cause
        && cause.code === 'session-expired'
      ) onSessionExpired?.();
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
  const resetPassword = async () => {
    if (!snapshot || !resetAllowed || password.length < 16) return;
    const plan = buildResetPasswordPlan(snapshot, vaultPassword(password));
    const execution = await applyPlan(plan, async () => {
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
    });
    if (execution.status === 'completed') {
      await invalidateUser();
      setPanel('password-success');
    }
  };
  const toggleIdentity = async () => {
    if (!snapshot?.entity || !togglePlan || !toggleAllowed) return;
    const entityId = snapshot.entity.id;
    const execution = await applyPlan(togglePlan, async () => {
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
    const execution = await applyPlan(removal.plan, async () => {
      if (removal.mode === 'managed-tombstone') {
        const fresh = await loadUserLifecycleSnapshot(gateway, session, reference);
        return { fingerprint: fresh.fingerprint, visibility: fresh.visibility };
      }
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

  const title = panel === 'password' || panel === 'password-success'
    ? 'Reset userpass password'
    : panel === 'toggle'
      ? snapshot?.entity?.disabled ? 'Enable Identity' : 'Disable Identity'
      : panel === 'remove'
        ? 'Disable and remove login'
        : 'Account lifecycle actions';

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => setPanel('menu')}
        aria-label="Open account lifecycle actions"
      >
        <i className="ri-shield-user-line" aria-hidden="true" />
        <span className="hidden xl:inline">Account actions</span>
      </Button>
      <Modal open={Boolean(panel)} onClose={close} title={title} width={panel === 'remove' ? 'xl' : 'lg'}>
        {panel === 'menu' && (
          <div className="space-y-3 p-4 sm:p-5">
            <div className="rounded-md border border-background-200 bg-background-100 px-3 py-2">
              <p className="font-mono text-[9px] uppercase tracking-[0.14em] text-foreground-400">
                auth/{reference.mount}/users/{reference.username}
              </p>
              <p className="mt-1 text-[10px] leading-4 text-foreground-600">
                These operations change login or Identity state. Existing-token behavior is
                stated separately for each action.
              </p>
            </div>
            {snapshotQuery.isError && (
              <div role="alert" className="rounded-md border border-warning-300 bg-warning-50 p-3 text-xs text-warning-900">
                Lifecycle dependencies could not be loaded. Retry the profile before changing it.
              </div>
            )}
            <ActionChoice
              icon="ri-key-2-line"
              title="Reset password"
              description="Replaces the password for future logins. Already issued tokens remain valid."
              disabled={capabilitiesPending || !resetAllowed}
              disabledReason={capabilitiesPending
                ? 'Checking the exact Vault path capability.'
                : 'This token cannot update the userpass password path.'}
              onClick={openPassword}
            />
            <ActionChoice
              icon={snapshot?.entity?.disabled ? 'ri-play-circle-line' : 'ri-forbid-2-line'}
              title={snapshot?.entity?.disabled ? 'Enable Identity' : 'Disable Identity'}
              description={snapshot?.entity?.disabled
                ? 'Allows identity-associated tokens to be used again; it does not create a login.'
                : 'Blocks identity-associated tokens immediately without deleting or revoking them.'}
              disabled={capabilitiesPending || !toggleAllowed}
              disabledReason={!togglePlan
                ? 'A linked Vault Console-managed Identity entity is required.'
                : capabilitiesPending
                  ? 'Checking the exact Identity capability.'
                  : 'This token cannot update the linked Identity entity.'}
              onClick={() => {
                clearTransient();
                setPanel('toggle');
              }}
            />
            <ActionChoice
              icon="ri-user-unfollow-line"
              title={removal?.mode === 'managed-tombstone'
                ? 'Disable and remove login'
                : 'Remove login only'}
              description="Deletes the userpass login. Existing tokens are not revoked; managed identities retain a disabled tombstone."
              tone="danger"
              disabled={capabilitiesPending || !removalAllowed}
              disabledReason={capabilitiesPending
                ? 'Checking every Vault path in the removal plan.'
                : 'This token is missing at least one capability required by the safe plan.'}
              onClick={() => {
                clearTransient();
                setPanel('remove');
              }}
            />
          </div>
        )}

        {panel === 'password' && snapshot && (
          <div className="space-y-4 p-4 sm:p-5">
            <div className="rounded-md border border-warning-200 bg-warning-50 p-3 text-[10px] leading-4 text-warning-800">
              The old password cannot be read or restored. Reset affects future logins only;
              existing tokens are not revoked. Use Disable for immediate identity-associated
              token blocking.
            </div>
            <div role="tablist" aria-label="Password source" className="grid grid-cols-2 gap-2">
              {(['generated', 'manual'] as const).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  role="tab"
                  aria-selected={passwordMode === mode}
                  onClick={() => {
                    setPasswordMode(mode);
                    setPassword(mode === 'generated' ? generateSecurePassword() : '');
                  }}
                  className={`rounded-md border px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
                    passwordMode === mode
                      ? 'border-primary-400 bg-primary-50 text-primary-800'
                      : 'border-background-300 text-foreground-600'
                  }`}
                >
                  {mode === 'generated' ? 'Generate securely' : 'Enter manually'}
                </button>
              ))}
            </div>
            {passwordMode === 'generated' ? (
              <div className="rounded-lg border border-background-300 bg-background-100 p-4">
                <p className="text-xs font-semibold text-foreground-800">New password prepared</p>
                <p className="mt-1 text-[10px] leading-4 text-foreground-500">
                  A {password.length}-character {passwordStrength.label.toLowerCase()} password
                  is held in memory. It can be revealed or copied only after Vault confirms
                  the reset.
                </p>
                <Button
                  type="button"
                  size="sm"
                  className="mt-3"
                  onClick={() => setPassword(generateSecurePassword())}
                >
                  <i className="ri-refresh-line" aria-hidden="true" /> Regenerate
                </Button>
              </div>
            ) : (
              <label className="block">
                <span className="text-xs font-medium text-foreground-700">New password</span>
                <input
                  name="new-password"
                  type="password"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete="new-password"
                  spellCheck={false}
                  className="mt-1 h-11 w-full rounded-md border border-background-300 bg-background-50 px-3 font-mono text-sm text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
                />
                <span className={`mt-1 block text-[10px] ${
                  password.length > 0 && password.length < 16
                    ? 'text-danger-600'
                    : 'text-foreground-400'
                }`}>
                  {password.length < 16
                    ? 'Use at least 16 characters.'
                    : `${passwordStrength.label} · ${password.length} characters`}
                </span>
              </label>
            )}
            <PlanExecutionNotice result={result} />
            <div className="flex justify-between border-t border-background-200 pt-4">
              <Button type="button" size="sm" onClick={backToMenu} disabled={applying}>Back</Button>
              <Button
                type="button"
                size="sm"
                variant="primary"
                loading={applying}
                disabled={!resetAllowed || password.length < 16}
                onClick={() => { void resetPassword(); }}
              >
                Reset password
              </Button>
            </div>
          </div>
        )}

        {panel === 'password-success' && (
          <PasswordHandoff
            username={reference.username}
            password={password}
            userpassMount={reference.mount}
            successTitle="Password reset successfully"
            successDescription="Vault confirmed the specialized password update."
            passwordLabel="Reset user password"
            onFinish={close}
          />
        )}

        {panel === 'toggle' && snapshot?.entity && togglePlan && (
          <div className="space-y-4 p-4 sm:p-5">
            <div className={`rounded-md border p-3 text-[10px] leading-4 ${
              snapshot.entity.disabled
                ? 'border-primary-200 bg-primary-50 text-primary-800'
                : 'border-warning-300 bg-warning-50 text-warning-900'
            }`}>
              {snapshot.entity.disabled
                ? 'Enable removes the Identity block. It does not recreate a deleted userpass login or change policies.'
                : 'Disable blocks identity-associated tokens on their next request. Tokens are blocked, not revoked, and the userpass login remains present.'}
            </div>
            <AccessReview
              plan={togglePlan}
              confirmation={confirmation}
              onConfirmationChange={setConfirmation}
            />
            <PlanExecutionNotice result={result} />
            <div className="flex justify-between border-t border-background-200 pt-4">
              <Button type="button" size="sm" onClick={backToMenu} disabled={applying}>Back</Button>
              <Button
                type="button"
                size="sm"
                variant={snapshot.entity.disabled ? 'primary' : 'danger'}
                loading={applying}
                disabled={!toggleAllowed}
                onClick={() => { void toggleIdentity(); }}
              >
                {snapshot.entity.disabled ? 'Enable Identity' : 'Disable Identity'}
              </Button>
            </div>
          </div>
        )}

        {panel === 'remove' && removal && (
          <div className="space-y-4 p-4 sm:p-5">
            <div className="rounded-md border border-danger-300 bg-danger-50 p-3 text-[10px] leading-4 text-danger-900">
              <p className="font-semibold">
                {removal.mode === 'managed-tombstone'
                  ? 'Managed removal retains a disabled Identity tombstone'
                  : 'Only the userpass login can be removed safely'}
              </p>
              <p className="mt-1">
                Deleting a login prevents future password logins but does not revoke issued
                tokens. Purge, when eligible, remains a separate advanced operation.
              </p>
              {removal.preservedReasons.length > 0 && (
                <ul className="mt-1 list-disc pl-4">
                  {removal.preservedReasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              )}
            </div>
            <AccessReview
              plan={removal.plan}
              confirmation={confirmation}
              onConfirmationChange={setConfirmation}
            />
            <PlanExecutionNotice result={result} />
            <div className="flex justify-between border-t border-background-200 pt-4">
              <Button type="button" size="sm" onClick={backToMenu} disabled={applying}>Back</Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                loading={applying}
                disabled={
                  !removalAllowed
                  || confirmation !== removal.plan.confirmation?.value
                }
                onClick={() => { void removeLogin(); }}
              >
                {removal.mode === 'managed-tombstone'
                  ? 'Disable and remove login'
                  : 'Remove login only'}
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
