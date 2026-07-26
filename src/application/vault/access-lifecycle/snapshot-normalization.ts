import { snapshotFingerprint } from '@/domain/access-control/lifecycle/change-plan';
import type {
  DependencyVisibility,
  RoleDependency,
} from '@/domain/access-control/lifecycle/model';
import type {
  VaultIdentityAlias,
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultUserpassAccount,
} from '@/domain/vault/contracts';

function sortedStrings(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function canonicalAlias(alias: VaultIdentityAlias): VaultIdentityAlias {
  return { ...alias };
}

export function canonicalUserpassAccount(
  account: VaultUserpassAccount,
): VaultUserpassAccount {
  return {
    ...account,
    tokenPolicies: sortedStrings(account.tokenPolicies),
    ...(account.tokenBoundCidrs
      ? { tokenBoundCidrs: sortedStrings(account.tokenBoundCidrs) }
      : {}),
  };
}

export function canonicalIdentityEntity(
  entity: VaultIdentityEntity,
): VaultIdentityEntity {
  return {
    ...entity,
    policies: sortedStrings(entity.policies),
    groupIds: sortedStrings(entity.groupIds),
    aliases: [...entity.aliases]
      .map(canonicalAlias)
      .sort((left, right) => (
        left.id.localeCompare(right.id)
        || left.mountAccessor.localeCompare(right.mountAccessor)
        || left.name.localeCompare(right.name)
      )),
  };
}

export function canonicalIdentityGroup(
  group: VaultIdentityGroup,
): VaultIdentityGroup {
  return {
    ...group,
    policies: sortedStrings(group.policies),
    memberEntityIds: sortedStrings(group.memberEntityIds),
    memberGroupIds: sortedStrings(group.memberGroupIds),
  };
}

export function canonicalDependencies(
  dependencies: readonly RoleDependency[],
): readonly RoleDependency[] {
  return [...dependencies].sort((left, right) => (
    left.kind.localeCompare(right.kind)
    || left.id.localeCompare(right.id)
    || left.name.localeCompare(right.name)
  ));
}

export function canonicalVisibility(
  visibility: DependencyVisibility,
): DependencyVisibility {
  return {
    complete: visibility.complete,
    reasons: sortedStrings(visibility.reasons),
  };
}

export function userpassAccountFingerprint(
  account: VaultUserpassAccount,
): string {
  return snapshotFingerprint(canonicalUserpassAccount(account));
}

export function identityEntityFingerprint(
  entity: VaultIdentityEntity,
): string {
  return snapshotFingerprint(canonicalIdentityEntity(entity));
}
