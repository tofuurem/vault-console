import {
  useEffect,
  useRef,
} from 'react';
import { useQueryClient } from '@tanstack/react-query';

import {
  useGroupLifecycleSnapshot,
  useSessionExpiryFromErrors,
} from '@/application/vault/access-lifecycle/lifecycle-queries';
import { vaultQueryKeys } from '@/application/query/vault-query-keys';
import {
  buildDeleteGroupPlan,
  loadGroupLifecycleSnapshot,
} from '@/application/vault/access-lifecycle/group-lifecycle';
import Button from '@/components/base/Button';
import ContentSkeleton from '@/components/base/ContentSkeleton';
import type { GroupLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import { assessIdentityOwnership } from '@/domain/access-control/resource-ownership';
import type {
  VaultAccessControlGateway,
  VaultIdentityGroup,
  VaultSession,
} from '@/domain/vault/contracts';
import type { CreateUserAccessCatalog } from '../create-user/access';
import DeletePlanDialog from '../workspace/DeletePlanDialog';
import DetailHeader from '../workspace/DetailHeader';
import { useDeletePlanWorkflow } from '../workspace/useDeletePlanWorkflow';
import WorkspaceLoadError from '../workspace/WorkspaceLoadError';
import GroupDetailContent from './GroupDetailContent';

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

function isManagedGroup(group: VaultIdentityGroup | null | undefined): boolean {
  return Boolean(
    group
    && (group.type ?? 'internal') === 'internal'
    && assessIdentityOwnership(group.metadata) === 'managed',
  );
}

function groupDeleteReason(
  snapshot: GroupLifecycleSnapshot,
  group: VaultIdentityGroup,
  managed: boolean,
  deleteAllowed: boolean,
): string | undefined {
  if (!managed) return 'Only Vault Console-managed internal groups can be deleted.';
  if (!snapshot.visibility.complete) return 'Dependency visibility is incomplete.';
  if (group.memberEntityIds.length > 0) return 'Remove every direct member first.';
  if (group.memberGroupIds.length > 0) return 'Detach every nested group first.';
  if (snapshot.parentGroups.length > 0) return 'Detach this group from every parent group first.';
  if (!deleteAllowed) return 'The current token cannot delete this group.';
  return undefined;
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
  const query = useGroupLifecycleSnapshot({ gateway, session }, groupId);
  const group = query.data?.group;
  const managed = isManagedGroup(group);
  const deletion = useDeletePlanWorkflow({
    gateway,
    session,
    snapshot: query.data,
    buildPlan: buildDeleteGroupPlan,
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
    onCompleted: async () => {
      await queryClient.invalidateQueries({ queryKey: vaultQueryKeys.groups() });
      onDeleted();
    },
    onSessionExpired,
  });

  useSessionExpiryFromErrors(onSessionExpired, query.error, deletion.capabilitiesError);

  useEffect(() => {
    if (query.isSuccess) headingRef.current?.focus();
  }, [groupId, query.isSuccess]);

  if (query.isPending) {
    return <ContentSkeleton label="Loading group detail" variant="workspace" />;
  }
  if (query.isError || !group || !query.data) {
    return (
      <WorkspaceLoadError
        message="This Identity group could not be loaded."
        onRetry={() => { void query.refetch(); }}
        onBack={onBack}
      />
    );
  }

  const deleteReason = groupDeleteReason(query.data, group, managed, deletion.allowed);

  return (
    <>
      <section className="flex min-h-0 flex-1 flex-col bg-background-100/40">
        <DetailHeader
          backAriaLabel="Back to groups"
          backLabel="Groups"
          onBack={onBack}
          iconClassName="ri-node-tree"
          iconToneClassName="border-secondary-200 bg-secondary-100 text-secondary-700"
          headingRef={headingRef}
          title={group.name}
          badgeLabel={managed ? 'Managed' : 'Read-only'}
          badgeToneClassName={managed
            ? 'bg-success-100 text-success-800'
            : 'bg-background-200 text-foreground-600'}
          subtitle={group.id}
          deleteReason={deleteReason}
          onDelete={deletion.openDialog}
        >
          <Button type="button" size="sm" disabled={!managed} onClick={onEdit}>
            <i className="ri-edit-line" aria-hidden="true" /> Edit group
          </Button>
        </DetailHeader>

        <GroupDetailContent
          snapshot={query.data}
          group={group}
          catalog={catalog}
          managed={managed}
          deleteReason={deleteReason}
        />
      </section>

      <DeletePlanDialog
        open={deletion.dialogOpen}
        title="Delete empty managed group"
        plan={deletion.plan}
        result={deletion.result}
        deleting={deletion.deleting}
        confirmation=""
        onConfirmationChange={() => {}}
        confirmLabel="Delete group"
        onClose={deletion.closeDialog}
        onConfirm={() => deletion.execute()}
      />
    </>
  );
}
