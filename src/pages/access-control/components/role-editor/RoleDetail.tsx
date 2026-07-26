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
  buildDeleteRolePlan,
  loadRoleLifecycleSnapshot,
} from '@/application/vault/access-lifecycle/role-lifecycle';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import Modal from '@/components/base/Modal';
import {
  capabilityRequirementsSatisfied,
  requiredCapabilities,
} from '@/domain/access-control/lifecycle/change-plan';
import { decompileKvV2Policy } from '@/domain/access-control/kv-v2-policy-decompiler';
import type { PlanExecutionResult } from '@/domain/access-control/lifecycle/model';
import {
  managedRoleName,
  parseManagedPolicyHcl,
} from '@/domain/access-control/managed-resources';
import {
  parseManagedPolicyHeader,
} from '@/domain/access-control/policy-ownership';
import type {
  VaultAccessControlGateway,
  VaultSession,
} from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';
import type { CreateUserAccessCatalog } from '../create-user/access';
import AccessReview from '../workspace/AccessReview';
import PlanExecutionNotice from '../workspace/PlanExecutionNotice';
import { roleSource } from './role-editor-draft';

interface RoleDetailProps {
  readonly policyName: string;
  readonly catalog: CreateUserAccessCatalog;
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly onBack: () => void;
  readonly onEdit: () => void;
  readonly onAdopt: () => void;
  readonly onDeleted: () => void;
  readonly onSessionExpired?: () => void;
}

export default function RoleDetail({
  policyName,
  catalog,
  gateway,
  session,
  onBack,
  onEdit,
  onAdopt,
  onDeleted,
  onSessionExpired,
}: RoleDetailProps) {
  const queryClient = useQueryClient();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const [deleting, setDeleting] = useState(false);
  const [result, setResult] = useState<PlanExecutionResult>();
  const query = useQuery({
    queryKey: vaultQueryKeys.roleEditor(policyName),
    queryFn: ({ signal }) => loadRoleLifecycleSnapshot(
      gateway,
      session,
      policyName,
      signal,
    ),
  });
  const snapshot = query.data;
  const policy = snapshot?.policy;
  const visualRules = useMemo(() => (
    policy
      ? decompileKvV2Policy(
          policy.policy,
          catalog.tree.map(({ mount }) => mount),
          roleSource(policy.name),
        )
      : null
  ), [catalog.tree, policy]);
  const header = policy ? parseManagedPolicyHeader(policy.policy) : null;
  const parsedRules = policy ? parseManagedPolicyHcl(policy.policy) : null;
  const deletePlan = useMemo(() => {
    if (!snapshot) return undefined;
    try {
      return buildDeleteRolePlan(snapshot);
    } catch {
      return undefined;
    }
  }, [snapshot]);
  const requirements = useMemo(
    () => requiredCapabilities(deletePlan?.operations ?? []),
    [deletePlan],
  );
  const paths = useMemo(() => requirements.map(({ path }) => path), [requirements]);
  const capabilities = useQuery({
    queryKey: vaultQueryKeys.accessPlanCapabilities(paths),
    queryFn: ({ signal }) => gateway.getCapabilities(session, paths, signal),
    enabled: paths.length > 0,
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
  }, [policyName, query.isSuccess]);

  if (query.isPending) {
    return <ContentSkeleton label="Loading role detail" variant="workspace" />;
  }
  if (query.isError || !snapshot || !policy) {
    return (
      <div className="flex h-full flex-col items-center justify-center p-5 text-center">
        <p role="alert" className="text-sm font-semibold text-warning-900">
          This role policy could not be loaded.
        </p>
        <div className="mt-3 flex gap-2">
          <Button type="button" size="sm" onClick={() => { void query.refetch(); }}>Retry</Button>
          <Button type="button" size="sm" onClick={onBack}>Back</Button>
        </div>
      </div>
    );
  }

  const canEdit = snapshot.ownership === 'managed'
    && snapshot.editable
    && visualRules !== null;
  const canAdopt = snapshot.ownership === 'unverified'
    && snapshot.editable
    && snapshot.visibility.complete
    && visualRules !== null;
  const deleteReason = snapshot.ownership !== 'managed'
    ? 'Only an adopted Vault Console-managed role can be deleted.'
    : !snapshot.visibility.complete
      ? 'Dependency visibility is incomplete.'
      : snapshot.dependencies.length > 0
        ? 'Detach this role from every user and group first.'
        : !deleteAllowed
          ? 'The current token cannot delete this policy.'
          : undefined;
  const deleteRole = async () => {
    if (!deletePlan || !deleteAllowed) return;
    setDeleting(true);
    setResult(undefined);
    try {
      const execution = await new ChangePlanExecutor({
        gateway,
        session,
        plan: deletePlan,
        loadFreshState: async (signal) => {
          const fresh = await loadRoleLifecycleSnapshot(
            gateway,
            session,
            policyName,
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
        queryClient.removeQueries({
          queryKey: vaultQueryKeys.policy(policyName),
        });
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: vaultQueryKeys.policies() }),
          queryClient.invalidateQueries({
            queryKey: vaultQueryKeys.policyCatalogs(),
          }),
        ]);
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
              <Button type="button" size="sm" onClick={onBack} aria-label="Back to roles">
                <i className="ri-arrow-left-line" aria-hidden="true" /> Roles
              </Button>
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary-200 bg-primary-100 text-primary-700">
                <i className="ri-shield-keyhole-line" aria-hidden="true" />
              </span>
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <h1
                    ref={headingRef}
                    tabIndex={-1}
                    className="truncate text-base font-semibold text-foreground-950 focus:outline-none"
                  >
                    {managedRoleName(policy.name)}
                  </h1>
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-semibold ${
                    snapshot.ownership === 'managed'
                      ? 'bg-success-100 text-success-800'
                      : 'bg-warning-100 text-warning-800'
                  }`}>
                    {snapshot.ownership === 'managed' ? 'Managed' : 'Unverified'}
                  </span>
                </div>
                <p className="truncate font-mono text-[9px] text-foreground-400">{policy.name}</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {snapshot.ownership === 'unverified' && (
                <Button type="button" size="sm" variant="primary" disabled={!canAdopt} onClick={onAdopt}>
                  <i className="ri-shield-check-line" aria-hidden="true" /> Adopt role
                </Button>
              )}
              {snapshot.ownership === 'managed' && (
                <Button type="button" size="sm" variant="primary" disabled={!canEdit} onClick={onEdit}>
                  <i className="ri-edit-line" aria-hidden="true" /> Edit role
                </Button>
              )}
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
            {visualRules === null && (
              <div role="alert" className="rounded-md border border-warning-300 bg-warning-50 px-3 py-2 text-[10px] leading-4 text-warning-900">
                This HCL cannot be round-tripped through the canonical visual KV editor.
                It remains readable below, but Adopt and Edit are disabled.
              </div>
            )}
            {deleteReason && snapshot.ownership === 'managed' && (
              <div className="rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-[10px] leading-4 text-warning-800">
                Delete blocked: {deleteReason}
              </div>
            )}
            <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
              {[
                ['Visual targets', visualRules?.length ?? '—'],
                ['HCL path blocks', parsedRules?.length ?? '—'],
                ['Dependencies', snapshot.dependencies.length],
                ['Effect timing', 'Next request'],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-background-300 bg-background-50 p-3">
                  <p className="font-mono text-[9px] uppercase text-foreground-400">{label}</p>
                  <p className="mt-1 font-mono text-sm font-semibold text-foreground-900">{value}</p>
                </div>
              ))}
            </section>

            <section className="rounded-lg border border-background-300 bg-background-50 p-4">
              <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-foreground-400">
                Managed description
              </p>
              <p className="mt-2 text-xs leading-5 text-foreground-700">
                {header?.kind === 'role'
                  ? header.description || 'No description.'
                  : 'No verified ownership header.'}
              </p>
            </section>

            <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <section className="rounded-lg border border-background-300 bg-background-50">
                <header className="border-b border-background-200 px-4 py-3">
                  <h2 className="text-xs font-semibold text-foreground-900">Visual KV targets</h2>
                </header>
                <div className="divide-y divide-background-100">
                  {visualRules?.map((rule) => (
                    <div key={`${rule.mount}:${rule.path}:${rule.target}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                      <span>
                        <span className="block font-mono text-xs text-foreground-800">
                          {rule.mount}/{rule.path || '*'}
                        </span>
                        <span className="text-[9px] uppercase text-foreground-400">{rule.target}</span>
                      </span>
                      <span className="rounded bg-primary-100 px-2 py-1 text-[9px] font-semibold text-primary-700">
                        {rule.level}
                      </span>
                    </div>
                  ))}
                  {visualRules?.length === 0 && (
                    <p className="px-4 py-8 text-center text-xs text-foreground-400">No visual targets.</p>
                  )}
                </div>
              </section>

              <section className="rounded-lg border border-background-300 bg-background-50">
                <header className="border-b border-background-200 px-4 py-3">
                  <h2 className="text-xs font-semibold text-foreground-900">References</h2>
                </header>
                <div className="divide-y divide-background-100">
                  {snapshot.dependencies.map((dependency) => (
                    <div key={`${dependency.kind}:${dependency.id}`} className="px-4 py-3">
                      <p className="text-xs font-semibold text-foreground-800">{dependency.name}</p>
                      <p className="font-mono text-[9px] text-foreground-400">
                        {dependency.kind} · {dependency.id}
                      </p>
                    </div>
                  ))}
                  {snapshot.dependencies.length === 0 && (
                    <p className="px-4 py-8 text-center text-xs text-foreground-400">No references.</p>
                  )}
                </div>
              </section>
            </div>

            <details className="rounded-lg border border-background-300 bg-background-50">
              <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-foreground-700">
                Raw HCL
              </summary>
              <pre className="max-h-[440px] overflow-auto whitespace-pre-wrap border-t border-background-200 p-4 font-mono text-[10px] text-foreground-600">
                {policy.policy}
              </pre>
            </details>
          </div>
        </div>
      </section>

      <Modal
        open={deleteOpen}
        onClose={() => {
          if (!deleting) setDeleteOpen(false);
        }}
        title="Delete managed role policy"
        width="lg"
      >
        {deletePlan && (
          <div className="space-y-4 p-4 sm:p-5">
            <AccessReview
              plan={deletePlan}
              confirmation={confirmation}
              onConfirmationChange={setConfirmation}
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
                disabled={confirmation !== deletePlan.confirmation?.value}
                onClick={() => { void deleteRole(); }}
              >
                Delete role permanently
              </Button>
            </div>
          </div>
        )}
      </Modal>
    </>
  );
}
