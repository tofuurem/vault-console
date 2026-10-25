import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  useRoleLifecycleSnapshot,
  useSessionExpiryFromErrors,
} from '@/application/vault/access-lifecycle/lifecycle-queries';
import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import {
  buildDeleteRolePlan,
  loadRoleLifecycleSnapshot,
} from '@/application/vault/access-lifecycle/role-lifecycle';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import { decompileKvV2Policy } from '@/domain/access-control/kv-v2-policy-decompiler';
import type { RoleLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import { managedRoleName } from '@/domain/access-control/managed-resources';
import type {
  VaultAccessControlGateway,
  VaultSession,
} from '@/domain/vault/contracts';
import type { CreateUserAccessCatalog } from '../create-user/access';
import DeletePlanDialog from '../workspace/DeletePlanDialog';
import DetailHeader from '../workspace/DetailHeader';
import { useDeletePlanWorkflow } from '../workspace/useDeletePlanWorkflow';
import WorkspaceLoadError from '../workspace/WorkspaceLoadError';
import RoleDetailContent from './RoleDetailContent';
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

function roleDeleteReason(
  snapshot: RoleLifecycleSnapshot,
  deleteAllowed: boolean,
): string | undefined {
  if (snapshot.ownership !== 'managed') {
    return 'Only an adopted Vault Console-managed role can be deleted.';
  }
  if (!snapshot.visibility.complete) return 'Dependency visibility is incomplete.';
  if (snapshot.dependencies.length > 0) return 'Detach this role from every user and group first.';
  if (!deleteAllowed) return 'The current token cannot delete this policy.';
  return undefined;
}

function roleDetailAccess(
  snapshot: RoleLifecycleSnapshot,
  visualSupported: boolean,
  deleteAllowed: boolean,
) {
  return {
    canEdit: snapshot.ownership === 'managed'
      && snapshot.editable
      && visualSupported,
    canAdopt: snapshot.ownership === 'unverified'
      && snapshot.editable
      && snapshot.visibility.complete
      && visualSupported,
    deleteReason: roleDeleteReason(snapshot, deleteAllowed),
  };
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
  const [confirmation, setConfirmation] = useState('');
  const query = useRoleLifecycleSnapshot({ gateway, session }, policyName);
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
  const deletion = useDeletePlanWorkflow({
    gateway,
    session,
    snapshot,
    buildPlan: buildDeleteRolePlan,
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
    onCompleted: async () => {
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
    },
    onSessionExpired,
  });

  useSessionExpiryFromErrors(onSessionExpired, query.error, deletion.capabilitiesError);

  useEffect(() => {
    if (query.isSuccess) headingRef.current?.focus();
  }, [policyName, query.isSuccess]);

  if (query.isPending) {
    return <ContentSkeleton label="Loading role detail" variant="workspace" />;
  }
  if (query.isError || !snapshot || !policy) {
    return (
      <WorkspaceLoadError
        message="This role policy could not be loaded."
        onRetry={() => { void query.refetch(); }}
        onBack={onBack}
      />
    );
  }

  const managed = snapshot.ownership === 'managed';
  const { canEdit, canAdopt, deleteReason } = roleDetailAccess(
    snapshot,
    visualRules !== null,
    deletion.allowed,
  );

  return (
    <>
      <section className="flex min-h-0 flex-1 flex-col bg-background-100/40">
        <DetailHeader
          backAriaLabel="Back to roles"
          backLabel="Roles"
          onBack={onBack}
          iconClassName="ri-shield-keyhole-line"
          iconToneClassName="border-primary-200 bg-primary-100 text-primary-700"
          headingRef={headingRef}
          title={managedRoleName(policy.name)}
          badgeLabel={managed ? 'Managed' : 'Unverified'}
          badgeToneClassName={managed
            ? 'bg-success-100 text-success-800'
            : 'bg-warning-100 text-warning-800'}
          subtitle={policy.name}
          deleteReason={deleteReason}
          onDelete={deletion.openDialog}
        >
          {snapshot.ownership === 'unverified' && (
            <Button type="button" size="sm" variant="primary" disabled={!canAdopt} onClick={onAdopt}>
              <i className="ri-shield-check-line" aria-hidden="true" /> Adopt role
            </Button>
          )}
          {managed && (
            <Button type="button" size="sm" variant="primary" disabled={!canEdit} onClick={onEdit}>
              <i className="ri-edit-line" aria-hidden="true" /> Edit role
            </Button>
          )}
        </DetailHeader>

        <RoleDetailContent
          snapshot={snapshot}
          policy={policy}
          visualRules={visualRules}
          deleteReason={deleteReason}
        />
      </section>

      <DeletePlanDialog
        open={deletion.dialogOpen}
        title="Delete managed role policy"
        plan={deletion.plan}
        result={deletion.result}
        deleting={deletion.deleting}
        confirmation={confirmation}
        onConfirmationChange={setConfirmation}
        confirmLabel="Delete role permanently"
        confirmDisabled={confirmation !== deletion.plan?.confirmation?.value}
        onClose={deletion.closeDialog}
        onConfirm={() => deletion.execute(confirmation)}
      />
    </>
  );
}
