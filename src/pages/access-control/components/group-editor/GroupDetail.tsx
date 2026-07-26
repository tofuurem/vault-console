import {
  useEffect,
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
  buildDeleteGroupPlan,
  loadGroupLifecycleSnapshot,
} from '@/application/vault/access-lifecycle/group-lifecycle';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import Modal from '@/components/base/Modal';
import {
  capabilityRequirementsSatisfied,
  requiredCapabilities,
} from '@/domain/access-control/lifecycle/change-plan';
import type { PlanExecutionResult } from '@/domain/access-control/lifecycle/model';
import { assessIdentityOwnership } from '@/domain/access-control/resource-ownership';
import type {
  VaultAccessControlGateway,
  VaultSession,
} from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';
import type { CreateUserAccessCatalog } from '../create-user/access';
import AccessReview from '../workspace/AccessReview';
import PlanExecutionNotice from '../workspace/PlanExecutionNotice';

interface GroupDetailProps {
  readonly groupId: string;
  readonly catalog: CreateUserAccessCatalog;
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly onBack: () => void;
  readonly onEdit: () => void;
  readonly onDeleted: () => void;
  readonly onSessionExpired?: () => void;
}

export default function GroupDetail({
  groupId,
  catalog,
  gateway,
  session,
  onBack,
  onEdit,
  onDeleted,
  onSessionExpired,
}: GroupDetailProps) {
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<PlanExecutionResult>();
  const query = useQuery({
    queryKey: vaultQueryKeys.groupEditor(groupId),
    queryFn: ({ signal }) => loadGroupLifecycleSnapshot(
      gateway,
      session,
      groupId,
      signal,
    ),
  });
  const group = query.data?.group;
  const managed = Boolean(
    group
    && (group.type ?? 'internal') === 'internal'
    && assessIdentityOwnership(group.metadata) === 'managed',
  );
  const deletePlan = useMemo(() => {
    if (!query.data) return undefined;
    try {
      return buildDeleteGroupPlan(query.data);
    } catch {
      return undefined;
    }
  }, [query.data]);
  const requirements = useMemo(
    () => requiredCapabilities(deletePlan?.operations ?? []),
    [deletePlan],
  );
  const capabilityPaths = useMemo(
    () => requirements.map(({ path }) => path),
    [requirements],
  );
  const capabilities = useQuery({
    queryKey: vaultQueryKeys.accessPlanCapabilities(capabilityPaths),
    queryFn: ({ signal }) => gateway.getCapabilities(session, capabilityPaths, signal),
    enabled: capabilityPaths.length > 0,
  });
  const deleteAllowed = Boolean(
    deletePlan
    && capabilities.data
    && capabilityRequirementsSatisfied(requirements, capabilities.data).allowed,
  );

  useEffect(() => {
    const cause = query.error ?? capabilities.error;
    if (cause && normalizeVaultError(cause).code === 'session-expired') {
      onSessionExpired?.();
    }
  }, [capabilities.error, onSessionExpired, query.error]);

  useEffect(() => {
    if (query.isSuccess) headingRef.current?.focus();
  }, [groupId, query.isSuccess]);

  if (query.isPending) {
    return <ContentSkeleton label="Loading group detail" variant="workspace" />;
  }
  if (query.isError || !group || !query.data) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-5 text-center">
        <p role="alert" className="text-sm font-semibold text-warning-900">
          This Identity group could not be loaded.
        </p>
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" onClick={() => { void query.refetch(); }}>Retry</Button>
          <Button type="button" size="sm" onClick={onBack}>Back</Button>
        </div>
      </div>
    );
  }

  const managedRoleNames = new Set(catalog.roles.flatMap(({ policyNames }) => policyNames));
  const roles = group.policies.filter((name) => managedRoleNames.has(name));
  const externalPolicies = group.policies.filter((name) => !managedRoleNames.has(name));
  const directMembers = group.memberEntityIds.map((entityId) => (
    query.data.entities.find(({ id }) => id === entityId)
  ));
  const deleteReason = !managed
    ? 'Only Vault Console-managed internal groups can be deleted.'
    : !query.data.visibility.complete
      ? 'Dependency visibility is incomplete.'
      : group.memberEntityIds.length > 0
        ? 'Remove every direct member first.'
        : group.memberGroupIds.length > 0
          ? 'Detach every nested group first.'
          : query.data.parentGroups.length > 0
            ? 'Detach this group from every parent group first.'
            : !deleteAllowed
              ? 'The current token cannot delete this group.'
              : undefined;
  const deleteGroup = async () => {
    if (!deletePlan || !deleteAllowed) return;
    setDeleting(true);
    setResult(undefined);
    try {
      const execution = await new ChangePlanExecutor({
        gateway,
        session,
        plan: deletePlan,
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
      }).apply();
      setResult(execution);
      if (execution.status === 'completed') {
        await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.groups() });
        onDeleted();
      }
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

  return (
    <>
      <section className="flex min-h-0 flex-1 flex-col bg-background-100/40">
        <header className="shrink-0 border-b border-background-300 bg-background-50 px-4 py-3 sm:px-5">
          <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-3">
              <Button type="button" size="sm" onClick={onBack} aria-label="Back to groups">
                <i className="ri-arrow-left-line" aria-hidden="true" /> Groups
              </Button>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-secondary-200 bg-secondary-100 text-secondary-700">
                <i className="ri-node-tree" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1
                    ref={headingRef}
                    tabIndex={-1}
                    className="truncate text-base font-semibold text-foreground-950 focus:outline-none"
                  >
                    {group.name}
                  </h1>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                    managed
                      ? 'bg-success-100 text-success-800'
                      : 'bg-background-200 text-foreground-600'
                  }`}>
                    {managed ? 'Managed' : 'Read-only'}
                  </span>
                </div>
                <p className="truncate font-mono text-[9px] text-foreground-400">{group.id}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" size="sm" disabled={!managed} onClick={onEdit}>
                <i className="ri-edit-line" aria-hidden="true" /> Edit group
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                disabled={Boolean(deleteReason)}
                title={deleteReason}
                onClick={() => setDeleteOpen(true)}
              >
                <i className="ri-delete-bin-6-line" aria-hidden="true" /> Delete
              </Button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
          <div className="mx-auto max-w-[1280px] space-y-5">
            {deleteReason && managed && (
              <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-[10px] leading-4 text-warning-800">
                Delete blocked: {deleteReason}
              </div>
            )}
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Direct members', group.memberEntityIds.length],
                ['Nested groups', group.memberGroupIds.length],
                ['Parent groups', query.data.parentGroups.length],
                ['Attached policies', group.policies.length],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-background-300 bg-background-50 p-3">
                  <p className="font-mono text-[9px] uppercase text-foreground-400">{label}</p>
                  <p className="mt-1 font-mono text-lg font-semibold text-foreground-900">{value}</p>
                </div>
              ))}
            </section>

            <section className="rounded-lg border border-background-300 bg-background-50 p-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-foreground-400">
                Description
              </p>
              <p className="mt-2 text-xs leading-5 text-foreground-700">
                {group.metadata.description || 'No managed description.'}
              </p>
            </section>

            <div className="grid gap-5 lg:grid-cols-2">
              <section className="rounded-lg border border-background-300 bg-background-50">
                <header className="border-b border-background-200 px-4 py-3">
                  <h2 className="text-xs font-semibold text-foreground-900">Direct members</h2>
                </header>
                <div className="divide-y divide-background-100">
                  {directMembers.map((entity, index) => (
                    <div key={group.memberEntityIds[index]} className="px-4 py-2.5">
                      <p className="text-xs font-semibold text-foreground-800">
                        {entity?.name ?? 'Unreadable entity'}
                      </p>
                      <p className="font-mono text-[9px] text-foreground-400">
                        {group.memberEntityIds[index]}
                      </p>
                    </div>
                  ))}
                  {directMembers.length === 0 && (
                    <p className="px-4 py-8 text-center text-xs text-foreground-400">No direct members.</p>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-background-300 bg-background-50">
                <header className="border-b border-background-200 px-4 py-3">
                  <h2 className="text-xs font-semibold text-foreground-900">Policy attachments</h2>
                </header>
                <div className="space-y-3 p-4">
                  <div>
                    <p className="text-[9px] font-semibold uppercase text-foreground-400">Managed roles</p>
                    <div className="mt-1.5 flex flex-wrap gap-1.5">
                      {roles.map((name) => (
                        <span key={name} className="rounded bg-primary-100 px-2 py-1 font-mono text-[9px] text-primary-700">
                          {name}
                        </span>
                      ))}
                      {roles.length === 0 && <span className="text-xs text-foreground-400">None</span>}
                    </div>
                  </div>
                  {externalPolicies.length > 0 && (
                    <div>
                      <p className="text-[9px] font-semibold uppercase text-foreground-400">External policies</p>
                      <div className="mt-1.5 flex flex-wrap gap-1.5">
                        {externalPolicies.map((name) => (
                          <span key={name} className="rounded bg-warning-100 px-2 py-1 font-mono text-[9px] text-warning-800">
                            {name}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </div>
        </div>
      </section>

      <Modal
        open={deleteOpen}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        title="Delete empty managed group"
        width="lg"
      >
        {deletePlan && (
          <div className="space-y-4 p-4 sm:p-5">
            <AccessReview
              plan={deletePlan}
              confirmation=""
              onConfirmationChange={() => {}}
            />
            <PlanExecutionNotice result={result} />
            <div className="flex justify-end gap-2 border-t border-background-200 pt-4">
              <Button type="button" size="sm" onClick={() => setDeleteOpen(false)} disabled={deleting}>
                Cancel
              </Button>
              <Button
                type="button"
                size="sm"
                variant="danger"
                loading={deleting}
                onClick={() => { void deleteGroup(); }}
              >
                Delete group
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
