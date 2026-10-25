import type { GroupLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import type { VaultIdentityGroup } from '@/domain/vault/contracts';
import type { CreateUserAccessCatalog } from '../create-user/access';
import {
  DeleteBlockedNotice,
  DetailEmptyRow,
  DetailMetrics,
  DetailNote,
  DetailPanel,
} from '../workspace/DetailSections';

interface GroupDetailContentProps {
  readonly snapshot: GroupLifecycleSnapshot;
  readonly group: VaultIdentityGroup;
  readonly catalog: CreateUserAccessCatalog;
  readonly managed: boolean;
  readonly deleteReason?: string;
}

function DirectMembersPanel({
  snapshot,
  group,
}: {
  readonly snapshot: GroupLifecycleSnapshot;
  readonly group: VaultIdentityGroup;
}) {
  const directMembers = group.memberEntityIds.map((entityId) => (
    snapshot.entities.find(({ id }) => id === entityId)
  ));
  return (
    <DetailPanel title="Direct members" bodyClassName="divide-y divide-background-100">
      {directMembers.map((entity, index) => (
        <div key={group.memberEntityIds[index]} className="px-4 py-2.5">
          <p className="text-xs font-semibold text-foreground-800">
            {entity?.name ?? 'Unreadable entity'}
          </p>
          <p className="font-mono text-[10px] text-foreground-400">
            {group.memberEntityIds[index]}
          </p>
        </div>
      ))}
      {directMembers.length === 0 && <DetailEmptyRow>No direct members.</DetailEmptyRow>}
    </DetailPanel>
  );
}

function PolicyAttachmentsPanel({
  group,
  catalog,
}: {
  readonly group: VaultIdentityGroup;
  readonly catalog: CreateUserAccessCatalog;
}) {
  const managedRoleNames = new Set(catalog.roles.flatMap(({ policyNames }) => policyNames));
  const roles = group.policies.filter((name) => managedRoleNames.has(name));
  const externalPolicies = group.policies.filter((name) => !managedRoleNames.has(name));
  return (
    <DetailPanel title="Policy attachments" bodyClassName="space-y-3 p-4">
      <div>
        <p className="text-[10px] font-semibold uppercase text-foreground-400">Managed roles</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {roles.map((name) => (
            <span key={name} className="rounded bg-primary-100 px-2 py-1 font-mono text-[10px] text-primary-700">
              {name}
            </span>
          ))}
          {roles.length === 0 && <span className="text-xs text-foreground-400">None</span>}
        </div>
      </div>
      {externalPolicies.length > 0 && (
        <div>
          <p className="text-[10px] font-semibold uppercase text-foreground-400">External policies</p>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {externalPolicies.map((name) => (
              <span key={name} className="rounded bg-warning-100 px-2 py-1 font-mono text-[10px] text-warning-800">
                {name}
              </span>
            ))}
          </div>
        </div>
      )}
    </DetailPanel>
  );
}

export default function GroupDetailContent({
  snapshot,
  group,
  catalog,
  managed,
  deleteReason,
}: GroupDetailContentProps) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
      <div className="mx-auto max-w-[1280px] space-y-5">
        {deleteReason && managed && <DeleteBlockedNotice reason={deleteReason} />}
        <DetailMetrics
          valueSizeClassName="text-lg"
          metrics={[
            ['Direct members', group.memberEntityIds.length],
            ['Nested groups', group.memberGroupIds.length],
            ['Parent groups', snapshot.parentGroups.length],
            ['Attached policies', group.policies.length],
          ]}
        />

        <DetailNote label="Description">
          {group.metadata.description || 'No managed description.'}
        </DetailNote>

        <div className="grid gap-5 lg:grid-cols-2">
          <DirectMembersPanel snapshot={snapshot} group={group} />
          <PolicyAttachmentsPanel group={group} catalog={catalog} />
        </div>
      </div>
    </div>
  );
}
