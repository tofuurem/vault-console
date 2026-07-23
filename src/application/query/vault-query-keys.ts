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
  secret: (
    mount: string,
    path: string,
    permissionKey: readonly unknown[],
  ) => [
    ...vaultQueryKeys.all,
    'kv-secret',
    mount,
    path,
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
  groups: () => [...vaultQueryKeys.all, 'groups'] as const,
  policies: () => [...vaultQueryKeys.all, 'policies'] as const,
  policy: (name: string) => [...vaultQueryKeys.all, 'policy', name] as const,
  policyCatalog: (names: readonly string[]) => [
    ...vaultQueryKeys.all,
    'policy-catalog',
    ...names,
  ] as const,
};
