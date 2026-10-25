export interface AccessCenterParams {
  readonly section?: string;
  readonly username?: string;
  readonly action?: string;
  readonly entityId?: string;
  readonly groupId?: string;
  readonly roleName?: string;
}

export type AccessCenterViewMode =
  | 'users-list'
  | 'users-create'
  | 'users-profile'
  | 'users-edit'
  | 'tombstones-list'
  | 'tombstone-detail'
  | 'groups-list'
  | 'group-detail'
  | 'group-edit'
  | 'roles-list'
  | 'role-detail'
  | 'role-edit'
  | 'policies';

export interface AccessCenterRoute {
  readonly params: AccessCenterParams;
  readonly activeSection: string;
  readonly profileMount: string | null;
  readonly creatingUser: boolean;
  readonly profileRequested: boolean;
  readonly editingUser: boolean;
  readonly removedIdentitiesRequested: boolean;
  readonly tombstoneDetailRequested: boolean;
  readonly groupRequested: boolean;
  readonly creatingGroup: boolean;
  readonly editingGroup: boolean;
  readonly roleRequested: boolean;
  readonly creatingRole: boolean;
  readonly roleMode: 'adopt' | 'edit';
  readonly editingRole: boolean;
  readonly usersNeeded: boolean;
  readonly groupsNeeded: boolean;
  readonly policiesNeeded: boolean;
  readonly policyCatalogNeeded: boolean;
  readonly viewMode: AccessCenterViewMode;
}

type RouteFlags = Omit<
  AccessCenterRoute,
  'usersNeeded' | 'groupsNeeded' | 'policiesNeeded' | 'policyCatalogNeeded' | 'viewMode'
>;

const ACCESS_SECTIONS = new Set(['users', 'groups', 'roles', 'policies']);

const SECTION_VIEW_MODES: Readonly<Record<string, AccessCenterViewMode>> = {
  groups: 'groups-list',
  roles: 'roles-list',
  policies: 'policies',
};

const VIEW_MODE_RULES: readonly (readonly [AccessCenterViewMode, (route: RouteFlags) => boolean])[] = [
  ['users-create', (route) => route.creatingUser],
  ['tombstone-detail', (route) => route.tombstoneDetailRequested],
  ['tombstones-list', (route) => route.removedIdentitiesRequested],
  ['group-edit', (route) => route.creatingGroup || route.editingGroup],
  ['group-detail', (route) => route.groupRequested],
  ['role-edit', (route) => route.creatingRole || route.editingRole],
  ['role-detail', (route) => route.roleRequested],
  ['users-edit', (route) => route.editingUser],
  ['users-profile', (route) => Boolean(route.params.username)],
];

function resolveActiveSection(params: AccessCenterParams): string {
  if (params.groupId) return 'groups';
  if (params.roleName) return 'roles';
  if (params.section && ACCESS_SECTIONS.has(params.section)) return params.section;
  return 'users';
}

function resolveRouteFlags(
  params: AccessCenterParams,
  profileMount: string | null,
  creatingUser: boolean,
): RouteFlags {
  const profileRequested = Boolean(params.username);
  const removedIdentitiesRequested = params.section === 'removed-identities'
    || Boolean(params.entityId);
  const groupRequested = Boolean(params.groupId);
  const creatingGroup = params.groupId === 'new';
  const roleRequested = Boolean(params.roleName);
  const creatingRole = params.roleName === 'new';
  return {
    params,
    activeSection: resolveActiveSection(params),
    profileMount,
    creatingUser,
    profileRequested,
    editingUser: profileRequested && params.action === 'edit',
    removedIdentitiesRequested,
    tombstoneDetailRequested: removedIdentitiesRequested && Boolean(params.entityId),
    groupRequested,
    creatingGroup,
    editingGroup: groupRequested && !creatingGroup && params.action === 'edit',
    roleRequested,
    creatingRole,
    roleMode: params.action === 'adopt' ? 'adopt' : 'edit',
    editingRole: roleRequested && !creatingRole && (
      params.action === 'edit' || params.action === 'adopt'
    ),
  };
}

function resolveViewMode(flags: RouteFlags): AccessCenterViewMode {
  const rule = VIEW_MODE_RULES.find(([, matches]) => matches(flags));
  return rule?.[0] ?? SECTION_VIEW_MODES[flags.activeSection] ?? 'users-list';
}

export function resolveAccessCenterRoute(
  params: AccessCenterParams,
  profileMount: string | null,
  creatingUser: boolean,
): AccessCenterRoute {
  const flags = resolveRouteFlags(params, profileMount, creatingUser);
  const { activeSection, profileRequested, removedIdentitiesRequested, editingUser, groupRequested } = flags;
  return {
    ...flags,
    usersNeeded: (
      (activeSection === 'users' && !profileRequested && !removedIdentitiesRequested)
      || creatingUser
      || (profileRequested && !profileMount)
    ),
    groupsNeeded: activeSection === 'groups' || creatingUser || editingUser,
    policiesNeeded: activeSection === 'roles'
      || activeSection === 'policies'
      || creatingUser
      || editingUser
      || groupRequested,
    policyCatalogNeeded: creatingUser
      || profileRequested
      || groupRequested
      || flags.roleRequested
      || activeSection === 'roles',
    viewMode: resolveViewMode(flags),
  };
}

export function hasAccessCenterTarget(params: AccessCenterParams): boolean {
  return Boolean(
    params.section
    || params.username
    || params.entityId
    || params.groupId
    || params.roleName,
  );
}

export interface UserAccountLocation {
  readonly username: string;
  readonly mount: string;
}

export function userProfileLocation({ username, mount }: UserAccountLocation) {
  return {
    pathname: `/access-control/users/${encodeURIComponent(username)}`,
    search: new URLSearchParams({ mount }).toString(),
  };
}

export function userEditLocation({ username, mount }: UserAccountLocation) {
  return {
    pathname: `/access-control/users/${encodeURIComponent(username)}/edit`,
    search: new URLSearchParams({ mount }).toString(),
  };
}

export function removedIdentityPath(entityId: string): string {
  return `/access-control/removed-identities/${encodeURIComponent(entityId)}`;
}

export function groupPath(groupId: string, action?: 'edit'): string {
  const path = `/access-control/groups/${encodeURIComponent(groupId)}`;
  return action ? `${path}/${action}` : path;
}

export function rolePath(policyName: string, action?: 'edit' | 'adopt'): string {
  const path = `/access-control/roles/${encodeURIComponent(policyName)}`;
  return action ? `${path}/${action}` : path;
}
