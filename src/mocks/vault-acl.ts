export type PermissionLevel = 'none' | 'view' | 'edit' | 'manage' | 'owner';

export interface PathPermission {
  path: string;
  level: PermissionLevel;
  inherited?: boolean;
  explicitDeny?: boolean;
  source?: string;
}

export interface VaultUserAccess {
  username: string;
  display_name: string;
  auth_mount: string;
  entity_id: string;
  alias_id: string;
  mount_accessor: string;
  groups: string[];
  direct_roles: string[];
  direct_access: PathPermission[];
  created_at: string;
  entity_metadata: Record<string, string>;
}

export interface VaultGroup {
  name: string;
  id: string;
  description: string;
  member_count: number;
  members: string[];
  roles: string[];
  child_groups: string[];
  created_at: string;
  metadata: Record<string, string>;
}

export interface VaultRole {
  name: string;
  display_name: string;
  description: string;
  access_summary: string;
  permissions: PathPermission[];
  groups: string[];
  direct_users: string[];
  is_external: boolean;
  created_at: string;
  hcl: string;
}

export interface VaultPolicy {
  name: string;
  type: 'role' | 'user-direct' | 'external';
  hcl: string;
  paths: { path: string; capabilities: string[]; }[];
  affected_users: string[];
  affected_groups: string[];
  is_external: boolean;
  description: string;
}

export const vaultUsers: VaultUserAccess[] = [
  {
    username: 'alice.johnson',
    display_name: 'Alice Johnson',
    auth_mount: 'userpass',
    entity_id: 'entity_7f3a2b91',
    alias_id: 'alias_a1b2c3d4',
    mount_accessor: 'auth_userpass_abc123',
    groups: ['platform-team', 'sre-observability'],
    direct_roles: ['vc-role-billing-editors'],
    direct_access: [],
    created_at: '2026-03-15T10:30:00Z',
    entity_metadata: { department: 'Platform Engineering', employee_id: 'ENG-142' },
  },
  {
    username: 'bob.chen',
    display_name: 'Bob Chen',
    auth_mount: 'userpass',
    entity_id: 'entity_9a4c8d12',
    alias_id: 'alias_e5f6g7h8',
    mount_accessor: 'auth_userpass_abc123',
    groups: ['billing-team'],
    direct_roles: [],
    direct_access: [
      { path: 'applications/billing/staging/*', level: 'edit', source: 'vc-user-bob.chen' },
    ],
    created_at: '2026-04-02T14:15:00Z',
    entity_metadata: { department: 'Billing', employee_id: 'ENG-287' },
  },
  {
    username: 'carol.diaz',
    display_name: 'Carol Diaz',
    auth_mount: 'userpass',
    entity_id: 'entity_2b7f1e55',
    alias_id: 'alias_i9j0k1l2',
    mount_accessor: 'auth_userpass_abc123',
    groups: ['dba-team', 'platform-team'],
    direct_roles: [],
    direct_access: [],
    created_at: '2026-05-10T09:00:00Z',
    entity_metadata: { department: 'Database Administration', employee_id: 'ENG-401' },
  },
  {
    username: 'dave.kim',
    display_name: 'Dave Kim',
    auth_mount: 'userpass',
    entity_id: 'entity_5c3e8d77',
    alias_id: 'alias_m3n4o5p6',
    mount_accessor: 'auth_userpass_abc123',
    groups: ['sre-observability'],
    direct_roles: ['vc-role-platform-readers'],
    direct_access: [],
    created_at: '2026-06-18T11:45:00Z',
    entity_metadata: { department: 'SRE', employee_id: 'ENG-512' },
  },
  {
    username: 'eve.martinez',
    display_name: 'Eve Martinez',
    auth_mount: 'userpass',
    entity_id: 'entity_8d1a4f33',
    alias_id: 'alias_q7r8s9t0',
    mount_accessor: 'auth_userpass_abc123',
    groups: ['billing-team', 'sre-observability'],
    direct_roles: [],
    direct_access: [
      { path: 'platform/infrastructure/postgres/*', level: 'manage', source: 'vc-user-eve.martinez' },
      { path: 'applications/billing/production/*', level: 'none', explicitDeny: true, source: 'vc-user-eve.martinez' },
    ],
    created_at: '2026-07-01T08:30:00Z',
    entity_metadata: { department: 'Platform', employee_id: 'ENG-623' },
  },
  {
    username: 'frank.nguyen',
    display_name: 'Frank Nguyen',
    auth_mount: 'userpass',
    entity_id: 'entity_4f9b2c88',
    alias_id: 'alias_u1v2w3x4',
    mount_accessor: 'auth_userpass_abc123',
    groups: [],
    direct_roles: ['vc-role-billing-editors'],
    direct_access: [
      { path: 'platform/shared/*', level: 'view', source: 'vc-user-frank.nguyen' },
    ],
    created_at: '2026-07-10T16:20:00Z',
    entity_metadata: { department: 'Finance Engineering', employee_id: 'ENG-745' },
  },
];

export const vaultGroups: VaultGroup[] = [
  {
    name: 'platform-team',
    id: 'group_platform_1a2b',
    description: 'Platform infrastructure engineers with full access to platform secrets',
    member_count: 2,
    members: ['alice.johnson', 'carol.diaz'],
    roles: ['vc-role-platform-readers'],
    child_groups: [],
    created_at: '2026-02-01T10:00:00Z',
    metadata: { managed_by: 'vault-console', created_by: 'ops-team' },
  },
  {
    name: 'billing-team',
    id: 'group_billing_3c4d',
    description: 'Billing application developers with edit access to billing secrets',
    member_count: 2,
    members: ['bob.chen', 'eve.martinez'],
    roles: ['vc-role-billing-editors'],
    child_groups: [],
    created_at: '2026-02-15T14:00:00Z',
    metadata: { managed_by: 'vault-console', created_by: 'ops-team' },
  },
  {
    name: 'dba-team',
    id: 'group_dba_5e6f',
    description: 'Database administrators with full control over database secrets',
    member_count: 1,
    members: ['carol.diaz'],
    roles: ['vc-role-dba-owners'],
    child_groups: [],
    created_at: '2026-03-01T09:00:00Z',
    metadata: { managed_by: 'vault-console', created_by: 'ops-team' },
  },
  {
    name: 'sre-observability',
    id: 'group_sre_7g8h',
    description: 'SRE team with read access to monitoring and logging secrets',
    member_count: 3,
    members: ['alice.johnson', 'dave.kim', 'eve.martinez'],
    roles: ['vc-role-sre-monitoring'],
    child_groups: [],
    created_at: '2026-03-20T11:00:00Z',
    metadata: { managed_by: 'vault-console', created_by: 'ops-team' },
  },
];

export const vaultRoles: VaultRole[] = [
  {
    name: 'vc-role-platform-readers',
    display_name: 'Platform Readers',
    description: 'Read-only access to all platform infrastructure and shared secrets',
    access_summary: 'View access to platform/* and platform/shared/*',
    permissions: [
      { path: 'platform/*', level: 'view' },
    ],
    groups: ['platform-team'],
    direct_users: ['dave.kim'],
    is_external: false,
    created_at: '2026-02-01T10:00:00Z',
    hcl: '# vc-role-platform-readers\npath "platform/*" {\n  capabilities = ["read", "list"]\n}\npath "platform/+/metadata/*" {\n  capabilities = ["read", "list"]\n}',
  },
  {
    name: 'vc-role-billing-editors',
    display_name: 'Billing Editors',
    description: 'Create and update access to billing application secrets across all environments',
    access_summary: 'Edit access to applications/billing/*',
    permissions: [
      { path: 'applications/billing/*', level: 'edit' },
    ],
    groups: ['billing-team'],
    direct_users: ['alice.johnson', 'frank.nguyen'],
    is_external: false,
    created_at: '2026-02-15T14:00:00Z',
    hcl: '# vc-role-billing-editors\npath "applications/billing/*" {\n  capabilities = ["create", "read", "update", "list"]\n}\npath "applications/billing/+/metadata/*" {\n  capabilities = ["read", "list"]\n}',
  },
  {
    name: 'vc-role-dba-owners',
    display_name: 'DBA Owners',
    description: 'Full control over database infrastructure secrets including version management and destruction',
    access_summary: 'Owner access to platform/infrastructure/postgres/* and platform/infrastructure/redis/*',
    permissions: [
      { path: 'platform/infrastructure/postgres/*', level: 'owner' },
      { path: 'platform/infrastructure/redis/*', level: 'owner' },
    ],
    groups: ['dba-team'],
    direct_users: [],
    is_external: false,
    created_at: '2026-03-01T09:00:00Z',
    hcl: '# vc-role-dba-owners\npath "platform/infrastructure/postgres/*" {\n  capabilities = ["create", "read", "update", "delete", "list"]\n}\npath "platform/infrastructure/redis/*" {\n  capabilities = ["create", "read", "update", "delete", "list"]\n}',
  },
  {
    name: 'vc-role-sre-monitoring',
    display_name: 'SRE Monitoring',
    description: 'Read and manage versions for shared monitoring and logging secrets',
    access_summary: 'Manage access to platform/shared/monitoring/* and platform/shared/logging/*',
    permissions: [
      { path: 'platform/shared/monitoring/*', level: 'manage' },
      { path: 'platform/shared/logging/*', level: 'manage' },
    ],
    groups: ['sre-observability'],
    direct_users: [],
    is_external: false,
    created_at: '2026-03-20T11:00:00Z',
    hcl: '# vc-role-sre-monitoring\npath "platform/shared/monitoring/*" {\n  capabilities = ["create", "read", "update", "delete", "list"]\n}\npath "platform/shared/logging/*" {\n  capabilities = ["create", "read", "update", "delete", "list"]\n}',
  },
];

export const vaultPolicies: VaultPolicy[] = [
  {
    name: 'vc-role-platform-readers',
    type: 'role',
    hcl: '# vc-role-platform-readers\npath "platform/*" {\n  capabilities = ["read", "list"]\n}\npath "platform/+/metadata/*" {\n  capabilities = ["read", "list"]\n}',
    paths: [
      { path: 'platform/*', capabilities: ['read', 'list'] },
      { path: 'platform/+/metadata/*', capabilities: ['read', 'list'] },
    ],
    affected_users: ['alice.johnson', 'carol.diaz', 'dave.kim'],
    affected_groups: ['platform-team'],
    is_external: false,
    description: 'UI-managed role: Platform Readers',
  },
  {
    name: 'vc-role-billing-editors',
    type: 'role',
    hcl: '# vc-role-billing-editors\npath "applications/billing/*" {\n  capabilities = ["create", "read", "update", "list"]\n}\npath "applications/billing/+/metadata/*" {\n  capabilities = ["read", "list"]\n}',
    paths: [
      { path: 'applications/billing/*', capabilities: ['create', 'read', 'update', 'list'] },
      { path: 'applications/billing/+/metadata/*', capabilities: ['read', 'list'] },
    ],
    affected_users: ['alice.johnson', 'bob.chen', 'eve.martinez', 'frank.nguyen'],
    affected_groups: ['billing-team'],
    is_external: false,
    description: 'UI-managed role: Billing Editors',
  },
  {
    name: 'vc-role-dba-owners',
    type: 'role',
    hcl: '# vc-role-dba-owners\npath "platform/infrastructure/postgres/*" {\n  capabilities = ["create", "read", "update", "delete", "list"]\n}\npath "platform/infrastructure/redis/*" {\n  capabilities = ["create", "read", "update", "delete", "list"]\n}',
    paths: [
      { path: 'platform/infrastructure/postgres/*', capabilities: ['create', 'read', 'update', 'delete', 'list'] },
      { path: 'platform/infrastructure/redis/*', capabilities: ['create', 'read', 'update', 'delete', 'list'] },
    ],
    affected_users: ['carol.diaz'],
    affected_groups: ['dba-team'],
    is_external: false,
    description: 'UI-managed role: DBA Owners',
  },
  {
    name: 'vc-role-sre-monitoring',
    type: 'role',
    hcl: '# vc-role-sre-monitoring\npath "platform/shared/monitoring/*" {\n  capabilities = ["create", "read", "update", "delete", "list"]\n}\npath "platform/shared/logging/*" {\n  capabilities = ["create", "read", "update", "delete", "list"]\n}',
    paths: [
      { path: 'platform/shared/monitoring/*', capabilities: ['create', 'read', 'update', 'delete', 'list'] },
      { path: 'platform/shared/logging/*', capabilities: ['create', 'read', 'update', 'delete', 'list'] },
    ],
    affected_users: ['alice.johnson', 'dave.kim', 'eve.martinez'],
    affected_groups: ['sre-observability'],
    is_external: false,
    description: 'UI-managed role: SRE Monitoring',
  },
  {
    name: 'vc-user-bob.chen',
    type: 'user-direct',
    hcl: '# vc-user-bob.chen\npath "applications/billing/staging/*" {\n  capabilities = ["create", "read", "update", "list"]\n}',
    paths: [
      { path: 'applications/billing/staging/*', capabilities: ['create', 'read', 'update', 'list'] },
    ],
    affected_users: ['bob.chen'],
    affected_groups: [],
    is_external: false,
    description: 'Auto-generated per-user policy for bob.chen',
  },
  {
    name: 'vc-user-eve.martinez',
    type: 'user-direct',
    hcl: '# vc-user-eve.martinez\npath "platform/infrastructure/postgres/*" {\n  capabilities = ["create", "read", "update", "delete", "list"]\n}\n\n# Deny production billing\npath "applications/billing/production/*" {\n  capabilities = ["deny"]\n}',
    paths: [
      { path: 'platform/infrastructure/postgres/*', capabilities: ['create', 'read', 'update', 'delete', 'list'] },
      { path: 'applications/billing/production/*', capabilities: ['deny'] },
    ],
    affected_users: ['eve.martinez'],
    affected_groups: [],
    is_external: false,
    description: 'Auto-generated per-user policy for eve.martinez',
  },
  {
    name: 'vc-user-frank.nguyen',
    type: 'user-direct',
    hcl: '# vc-user-frank.nguyen\npath "platform/shared/*" {\n  capabilities = ["read", "list"]\n}',
    paths: [
      { path: 'platform/shared/*', capabilities: ['read', 'list'] },
    ],
    affected_users: ['frank.nguyen'],
    affected_groups: [],
    is_external: false,
    description: 'Auto-generated per-user policy for frank.nguyen',
  },
  {
    name: 'admin-policy',
    type: 'external',
    hcl: '# External admin policy\npath "*" {\n  capabilities = ["create", "read", "update", "delete", "list", "sudo"]\n}',
    paths: [
      { path: '*', capabilities: ['create', 'read', 'update', 'delete', 'list', 'sudo'] },
    ],
    affected_users: ['ops-team'],
    affected_groups: [],
    is_external: true,
    description: 'External admin policy (not managed by Vault Console)',
  },
  {
    name: 'default',
    type: 'external',
    hcl: '# Default policy\npath "secret/*" {\n  capabilities = ["read", "list"]\n}',
    paths: [
      { path: 'secret/*', capabilities: ['read', 'list'] },
    ],
    affected_users: ['*'],
    affected_groups: ['*'],
    is_external: true,
    description: 'Vault default policy',
  },
];

export function getUserByUsername(username: string): VaultUserAccess | undefined {
  return vaultUsers.find((u) => u.username === username);
}

export function getGroupByName(name: string): VaultGroup | undefined {
  return vaultGroups.find((g) => g.name === name);
}

export function getRoleByName(name: string): VaultRole | undefined {
  return vaultRoles.find((r) => r.name === name);
}

export function getPolicyByName(name: string): VaultPolicy | undefined {
  return vaultPolicies.find((p) => p.name === name);
}

export function getEffectiveAccess(username: string): PathPermission[] {
  const user = getUserByUsername(username);
  if (!user) return [];

  const allPerms: Map<string, { level: PermissionLevel; sources: string[]; explicitDeny?: boolean }> = new Map();

  // Direct user access
  user.direct_access.forEach((perm) => {
    allPerms.set(perm.path, { level: perm.level, sources: [perm.source || 'Direct access'], explicitDeny: perm.explicitDeny });
  });

  // Direct roles
  user.direct_roles.forEach((roleName) => {
    const role = getRoleByName(roleName);
    if (role) {
      role.permissions.forEach((perm) => {
        const existing = allPerms.get(perm.path);
        if (!existing || (!existing.explicitDeny && permissionPriority(perm.level) > permissionPriority(existing.level))) {
          allPerms.set(perm.path, { level: perm.level, sources: [role.display_name] });
        }
        if (existing && !existing.sources.includes(role.display_name)) {
          existing.sources.push(role.display_name);
        }
      });
    }
  });

  // Group roles
  user.groups.forEach((groupName) => {
    const group = getGroupByName(groupName);
    if (group) {
      group.roles.forEach((roleName) => {
        const role = getRoleByName(roleName);
        if (role) {
          role.permissions.forEach((perm) => {
            const existing = allPerms.get(perm.path);
            if (!existing || (!existing.explicitDeny && permissionPriority(perm.level) > permissionPriority(existing.level))) {
              allPerms.set(perm.path, { level: perm.level, sources: [`${groupName} → ${role.display_name}`] });
            }
            if (existing) {
              const sourceLabel = `${groupName} → ${role.display_name}`;
              if (!existing.sources.includes(sourceLabel)) {
                existing.sources.push(sourceLabel);
              }
            }
          });
        }
      });
    }
  });

  return Array.from(allPerms.entries()).map(([path, info]) => ({
    path,
    level: info.level,
    source: info.sources.join(', '),
    explicitDeny: info.explicitDeny,
  }));
}

function permissionPriority(level: PermissionLevel): number {
  const order: PermissionLevel[] = ['none', 'view', 'edit', 'manage', 'owner'];
  return order.indexOf(level);
}

export function getEffectivePermission(path: string, username: string): { level: PermissionLevel; source: string } {
  const allAccess = getEffectiveAccess(username);
  let bestMatch: { level: PermissionLevel; source: string } = { level: 'none', source: 'Default' };

  allAccess.forEach((perm) => {
    if (matchPath(path, perm.path)) {
      if (perm.explicitDeny) {
        bestMatch = { level: 'none', source: `Denied by: ${perm.source}` };
      } else if (permissionPriority(perm.level) > permissionPriority(bestMatch.level) && bestMatch.level !== 'none') {
        bestMatch = { level: perm.level, source: perm.source || 'Unknown' };
      } else if (bestMatch.level === 'none' && !perm.explicitDeny) {
        bestMatch = { level: perm.level, source: perm.source || 'Unknown' };
      }
    }
  });

  return bestMatch;
}

function matchPath(testPath: string, pattern: string): boolean {
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*');
  const regex = new RegExp(`^${regexStr}$`);
  return regex.test(testPath);
}

export const permissionLevels: { value: PermissionLevel; label: string; description: string }[] = [
  { value: 'none', label: 'No access', description: 'Explicitly deny access — overrides all other grants' },
  { value: 'view', label: 'View', description: 'Browse folders, read metadata, and read secret values' },
  { value: 'edit', label: 'Edit', description: 'View + create, update, and patch secret data' },
  { value: 'manage', label: 'Manage versions', description: 'Edit + soft-delete and undelete versions' },
  { value: 'owner', label: 'Owner', description: 'Manage + permanent destruction and metadata deletion' },
];

export const vaultMountTree: { mount: string; path: string; name: string; children?: typeof vaultMountTree }[] = [
  {
    mount: 'applications/', path: 'applications/', name: 'applications/',
    children: [
      {
        mount: 'applications/', path: 'applications/billing/', name: 'billing/',
        children: [
          { mount: 'applications/', path: 'applications/billing/production/', name: 'production/' },
          { mount: 'applications/', path: 'applications/billing/staging/', name: 'staging/' },
        ],
      },
      {
        mount: 'applications/', path: 'applications/payments/', name: 'payments/',
        children: [
          { mount: 'applications/', path: 'applications/payments/production/', name: 'production/' },
        ],
      },
    ],
  },
  {
    mount: 'platform/', path: 'platform/', name: 'platform/',
    children: [
      {
        mount: 'platform/', path: 'platform/infrastructure/', name: 'infrastructure/',
        children: [
          { mount: 'platform/', path: 'platform/infrastructure/postgres/', name: 'postgres/' },
          { mount: 'platform/', path: 'platform/infrastructure/redis/', name: 'redis/' },
          { mount: 'platform/', path: 'platform/infrastructure/kafka/', name: 'kafka/' },
        ],
      },
      {
        mount: 'platform/', path: 'platform/shared/', name: 'shared/',
        children: [
          { mount: 'platform/', path: 'platform/shared/monitoring/', name: 'monitoring/' },
          { mount: 'platform/', path: 'platform/shared/logging/', name: 'logging/' },
        ],
      },
    ],
  },
  {
    mount: 'secret/', path: 'secret/', name: 'secret/',
  },
];

export function generatePassword(length = 24): string {
  const upper = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const lower = 'abcdefghjkmnpqrstuvwxyz';
  const digits = '23456789';
  const special = '!@#$%&*_-+=';
  const all = upper + lower + digits + special;

  let pass = '';
  pass += upper[Math.floor(Math.random() * upper.length)];
  pass += lower[Math.floor(Math.random() * lower.length)];
  pass += digits[Math.floor(Math.random() * digits.length)];
  pass += special[Math.floor(Math.random() * special.length)];

  for (let i = pass.length; i < length; i++) {
    pass += all[Math.floor(Math.random() * all.length)];
  }

  return pass.split('').sort(() => Math.random() - 0.5).join('');
}

export function passwordStrength(password: string): { score: number; label: string; color: string } {
  let score = 0;
  if (password.length >= 12) score++;
  if (password.length >= 20) score++;
  if (/[A-Z]/.test(password) && /[a-z]/.test(password)) score++;
  if (/\d/.test(password)) score++;
  if (/[!@#$%&*_\-+=]/.test(password)) score++;
  if (password.length >= 24) score++;

  if (score >= 5) return { score, label: 'Excellent', color: 'bg-emerald-500' };
  if (score >= 4) return { score, label: 'Strong', color: 'bg-emerald-500' };
  if (score >= 3) return { score, label: 'Good', color: 'bg-amber-500' };
  if (score >= 2) return { score, label: 'Fair', color: 'bg-amber-500' };
  return { score, label: 'Weak', color: 'bg-red-500' };
}