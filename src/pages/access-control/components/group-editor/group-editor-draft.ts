import type { GroupDraft } from '@/application/vault/access-lifecycle/group-lifecycle';
import { permissionDiff } from '@/domain/access-control/lifecycle/change-plan';
import type { GroupLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import type { CreateUserAccessCatalog } from '../create-user/access';

export interface GroupEditorDraft {
  readonly name: string;
  readonly description: string;
  readonly memberEntityIds: readonly string[];
  readonly selectedRolePolicyNames: readonly string[];
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

function rulesFor(
  names: readonly string[],
  catalog: CreateUserAccessCatalog,
) {
  const selected = new Set(names);
  return catalog.policies.flatMap((policy) => (
    selected.has(policy.name) ? policy.rules ?? [] : []
  ));
}

export function initialGroupEditorDraft(
  snapshot: GroupLifecycleSnapshot,
  catalog: CreateUserAccessCatalog,
): GroupEditorDraft {
  const managedRoles = new Set(catalog.roles.flatMap(({ policyNames }) => policyNames));
  return {
    name: snapshot.group?.name ?? '',
    description: snapshot.group?.metadata.description ?? '',
    memberEntityIds: snapshot.group?.memberEntityIds ?? [],
    selectedRolePolicyNames: snapshot.group?.policies.filter(
      (name) => managedRoles.has(name),
    ) ?? [],
  };
}

export function groupEditorDraftKey(draft: GroupEditorDraft): string {
  return JSON.stringify({
    name: draft.name,
    description: draft.description,
    memberEntityIds: [...draft.memberEntityIds].sort(),
    selectedRolePolicyNames: [...draft.selectedRolePolicyNames].sort(),
  });
}

export function toGroupDraft(
  snapshot: GroupLifecycleSnapshot,
  draft: GroupEditorDraft,
  catalog: CreateUserAccessCatalog,
): GroupDraft {
  const managedRolePolicyNames = unique(
    catalog.roles.flatMap(({ policyNames }) => policyNames),
  );
  const beforeRoleNames = snapshot.group?.policies.filter(
    (name) => managedRolePolicyNames.includes(name),
  ) ?? [];
  return {
    ...draft,
    managedRolePolicyNames,
    memberEntityIds: unique(draft.memberEntityIds),
    selectedRolePolicyNames: unique(draft.selectedRolePolicyNames),
    permissionDiff: permissionDiff(
      rulesFor(beforeRoleNames, catalog),
      rulesFor(draft.selectedRolePolicyNames, catalog),
    ),
  };
}
