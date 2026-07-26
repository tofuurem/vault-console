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
  buildPurgeIdentityPlan,
  loadIdentityTombstoneSnapshot,
} from '@/application/vault/access-lifecycle/user-lifecycle';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import {
  capabilityRequirementsSatisfied,
  requiredCapabilities,
} from '@/domain/access-control/lifecycle/change-plan';
import type { PlanExecutionResult } from '@/domain/access-control/lifecycle/model';
import type {
  VaultAccessControlGateway,
  VaultSession,
} from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';
import AccessReview from '../workspace/AccessReview';

interface TombstoneDetailProps {
  readonly entityId: string;
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly onBack: () => void;
  readonly onPurged: () => void;
  readonly onSessionExpired?: () => void;
}

export default function TombstoneDetail({
  entityId,
  gateway,
  session,
  onBack,
  onPurged,
  onSessionExpired,
}: TombstoneDetailProps) {
  const queryClient = useQueryClient();
  const [confirmation, setConfirmation] = useState('');
  const [applying, setApplying] = useState(false);
  const [result, setResult] = useState<PlanExecutionResult>();
  const query = useQuery({
    queryKey: vaultQueryKeys.identityTombstone(entityId),
    queryFn: ({ signal }) => loadIdentityTombstoneSnapshot(
      gateway,
      session,
      entityId,
      signal,
    ),
  });
  const plan = useMemo(() => {
    if (!query.data) return undefined;
    try {
      return buildPurgeIdentityPlan(query.data);
    } catch {
      return undefined;
    }
  }, [query.data]);
  const requirements = useMemo(
    () => requiredCapabilities(plan?.operations ?? []),
    [plan],
  );
  const paths = useMemo(() => requirements.map(({ path }) => path), [requirements]);
  const capabilities = useQuery({
    queryKey: vaultQueryKeys.accessPlanCapabilities(paths),
    queryFn: ({ signal }) => gateway.getCapabilities(session, paths, signal),
    enabled: paths.length > 0,
  });
  const allowed = Boolean(
    plan
    && capabilities.data
    && capabilityRequirementsSatisfied(requirements, capabilities.data).allowed,
  );

  useEffect(() => {
    const cause = query.error ?? capabilities.error;
    if (cause && normalizeVaultError(cause).code === 'session-expired') {
      onSessionExpired?.();
    }
  }, [capabilities.error, onSessionExpired, query.error]);

  if (query.isPending) {
    return <ContentSkeleton label="Loading removed Identity" variant="workspace" />;
  }
  if (query.isError || !query.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-5 text-center">
        <p role="alert" className="text-sm font-semibold text-warning-900">
          This removed Identity could not be loaded.
        </p>
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" onClick={() => { void query.refetch(); }}>Retry</Button>
          <Button type="button" size="sm" onClick={onBack}>Back</Button>
        </div>
      </div>
    );
  }

  const snapshot = query.data;
  const entity = snapshot.entity;
  const purge = async () => {
    if (!plan || !allowed) return;
    setApplying(true);
    setResult(undefined);
    try {
      const execution = await new ChangePlanExecutor({
        gateway,
        session,
        plan,
        loadFreshState: async (signal) => {
          const fresh = await loadIdentityTombstoneSnapshot(
            gateway,
            session,
            entityId,
            signal,
          );
          return {
            fingerprint: fresh.fingerprint,
            visibility: fresh.visibility,
          };
        },
      }).apply({ confirmation });
      setResult(execution);
      if (execution.status === 'completed') {
        await queryClient.invalidateQueries({
          queryKey: vaultQueryKeys.identityTombstones(),
        });
        onPurged();
      }
    } catch (cause) {
      if (
        typeof cause === 'object'
        && cause
        && 'code' in cause
        && cause.code === 'session-expired'
      ) onSessionExpired?.();
      setResult({
        status: 'partial',
        operations: [],
        recovery: [],
        errorMessage: 'Vault did not confirm the Identity purge.',
      });
    } finally {
      setApplying(false);
    }
  };

  return (
    <section className="flex min-h-0 flex-1 flex-col bg-background-100/50">
      <header className="shrink-0 border-b border-background-300 bg-background-50 px-4 py-3 sm:px-5">
        <div className="mx-auto flex max-w-[1180px] items-center gap-3">
          <Button type="button" size="sm" onClick={onBack} aria-label="Back to removed identities">
            <i className="ri-arrow-left-line" aria-hidden="true" /> Removed
          </Button>
          <div className="min-w-0">
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-danger-600">
              Disabled Identity tombstone
            </p>
            <h1 className="truncate text-sm font-semibold text-foreground-900">{entity.name}</h1>
            <p className="truncate font-mono text-[9px] text-foreground-400">{entity.id}</p>
          </div>
        </div>
      </header>
      <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-[1180px] space-y-5">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border border-background-300 bg-background-50 p-3">
              <p className="font-mono text-[9px] uppercase text-foreground-400">Removed login</p>
              <p className="mt-1 font-mono text-xs text-foreground-800">
                {entity.metadata?.username ?? 'Unknown'}
              </p>
            </div>
            <div className="rounded-lg border border-background-300 bg-background-50 p-3">
              <p className="font-mono text-[9px] uppercase text-foreground-400">Auth mount</p>
              <p className="mt-1 font-mono text-xs text-foreground-800">
                auth/{entity.metadata?.auth_mount ?? 'unknown'}
              </p>
            </div>
            <div className="rounded-lg border border-warning-300 bg-warning-50 p-3">
              <p className="font-mono text-[9px] uppercase text-warning-700">Token state</p>
              <p className="mt-1 text-xs font-semibold text-warning-900">
                Blocked by Identity, not revoked
              </p>
            </div>
          </div>

          {!plan ? (
            <div role="alert" className="rounded-lg border border-warning-300 bg-warning-50 p-4 text-warning-900">
              <p className="text-xs font-semibold">Purge is not currently safe</p>
              <p className="mt-1 text-[10px] leading-4">
                The entity must remain managed, disabled, empty, detached from every group,
                and its former userpass login must be verified absent.
              </p>
              {snapshot.visibility.reasons.length > 0 && (
                <ul className="mt-2 list-disc pl-4 text-[10px] leading-4">
                  {snapshot.visibility.reasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              )}
            </div>
          ) : (
            <>
              <div className="rounded-lg border border-danger-300 bg-danger-50 p-4 text-danger-900">
                <p className="text-xs font-semibold">Advanced permanent cleanup</p>
                <p className="mt-1 text-[10px] leading-4">
                  Purge deletes the Identity entity and removes the block it provides. Continue
                  only after every issued token was revoked or has expired.
                </p>
              </div>
              <AccessReview
                plan={plan}
                confirmation={confirmation}
                onConfirmationChange={setConfirmation}
              />
              {result && result.status !== 'completed' && (
                <div role="alert" className="rounded-md border border-danger-300 bg-danger-50 p-3 text-xs text-danger-900">
                  {result.status === 'blocked'
                    ? `Purge blocked during ${result.blockReason ?? 'preflight'}.`
                    : result.errorMessage}
                </div>
              )}
              <div className="flex justify-end border-t border-background-300 pt-4">
                <Button
                  type="button"
                  variant="danger"
                  loading={applying}
                  disabled={
                    !allowed
                    || confirmation !== plan.confirmation?.value
                  }
                  onClick={() => { void purge(); }}
                >
                  Purge Identity permanently
                </Button>
              </div>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
