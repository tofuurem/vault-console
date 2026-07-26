export const vaultQueryKeys = {
  all: ['vault'] as const,
  mounts: () => [...vaultQueryKeys.all, 'kv-mounts'] as const,
  mountCreationPermission: (path: string) => [
    ...vaultQueryKeys.all,
    'kv-mount-creation-permission',
    path,
  ] as const,
  directory: (mount: string, path: string) => [
    ...vaultQueryKeys.all,
    'kv-directory',
    mount,
    path,
  ] as const,
  secretScope: (mount: string, path: string) => [
    ...vaultQueryKeys.all,
    'kv-secret',
    mount,
    path,
  ] as const,
  secret: (
    mount: string,
    path: string,
    permissionKey: readonly unknown[],
  ) => [
    ...vaultQueryKeys.secretScope(mount, path),
    ...permissionKey,
  ] as const,
  permissions: (mount: string, path: string) => [
    ...vaultQueryKeys.all,
    'kv-permissions',
    mount,
    path,
  ] as const,
  authMounts: () => [...vaultQueryKeys.all, 'auth-mounts'] as const,
  userpassUsers: (mounts: readonly string[]) => [
    ...vaultQueryKeys.all,
    'userpass-users',
    ...mounts,
  ] as const,
  userpassUser: (mount: string, username: string) => [
    ...vaultQueryKeys.all,
    'userpass-user',
    mount,
    username,
  ] as const,
  userAccessAccount: (mount: string, username: string) => [
    ...vaultQueryKeys.all,
    'user-access-account',
    mount,
    username,
  ] as const,
  userAccessIdentity: (mount: string, username: string) => [
    ...vaultQueryKeys.all,
    'user-access-identity',
    mount,
    username,
  ] as const,
  userAccessGroups: (mount: string, username: string) => [
    ...vaultQueryKeys.all,
    'user-access-groups',
    mount,
    username,
  ] as const,
  userAccessPolicy: (mount: string, username: string, policyName: string) => [
    ...vaultQueryKeys.all,
    'user-access-policy',
    mount,
    username,
    policyName,
  ] as const,
  userAccessPolicyBatch: (
    mount: string,
    username: string,
    policyNames: readonly string[],
  ) => [
    ...vaultQueryKeys.all,
    'user-access-policy-batch',
    mount,
    username,
    ...policyNames,
  ] as const,
  groups: () => [...vaultQueryKeys.all, 'groups'] as const,
  group: (groupId: string) => [...vaultQueryKeys.groups(), groupId] as const,
  groupEditor: (groupId: string) => [
    ...vaultQueryKeys.group(groupId),
    'editor',
  ] as const,
  policies: () => [...vaultQueryKeys.all, 'policies'] as const,
  policyRecords: () => [...vaultQueryKeys.all, 'policy'] as const,
  policy: (name: string) => [...vaultQueryKeys.policyRecords(), name] as const,
  policyCatalogs: () => [...vaultQueryKeys.all, 'policy-catalog'] as const,
  roleEditor: (name: string) => [
    ...vaultQueryKeys.policy(name),
    'editor',
  ] as const,
  userEditor: (mount: string, username: string) => [
    ...vaultQueryKeys.userpassUser(mount, username),
    'editor',
  ] as const,
  identityTombstones: () => [
    ...vaultQueryKeys.all,
    'identity-tombstones',
  ] as const,
  identityTombstone: (entityId: string) => [
    ...vaultQueryKeys.identityTombstones(),
    entityId,
  ] as const,
  accessPlanCapabilities: (paths: readonly string[]) => [
    ...vaultQueryKeys.all,
    'access-plan-capabilities',
    ...paths,
  ] as const,
  policyCatalog: (names: readonly string[]) => [
    ...vaultQueryKeys.policyCatalogs(),
    ...names,
  ] as const,
};
