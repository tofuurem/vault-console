import type { VaultCapability } from './types';

export const KV_PERMISSION_LEVELS = [
  'inherited',
  'view',
  'edit',
  'manage-versions',
  'owner',
  'deny',
] as const;

export type KvPermissionLevel = (typeof KV_PERMISSION_LEVELS)[number];

export interface KvPermissionPreset {
  readonly label: string;
  readonly description: string;
  readonly dangerous: boolean;
  readonly data: readonly VaultCapability[];
  readonly metadata: readonly VaultCapability[];
  readonly deleteVersions: readonly VaultCapability[];
  readonly undeleteVersions: readonly VaultCapability[];
  readonly destroyVersions: readonly VaultCapability[];
}

export const KV_PERMISSION_PRESETS: Readonly<Record<KvPermissionLevel, KvPermissionPreset>> = {
  inherited: {
    label: 'Inherited',
    description: 'Keep access from groups and roles without adding a direct rule.',
    dangerous: false,
    data: [],
    metadata: [],
    deleteVersions: [],
    undeleteVersions: [],
    destroyVersions: [],
  },
  view: {
    label: 'View',
    description: 'Browse folders and read secret values and metadata.',
    dangerous: false,
    data: ['read'],
    metadata: ['read', 'list'],
    deleteVersions: [],
    undeleteVersions: [],
    destroyVersions: [],
  },
  edit: {
    label: 'Edit',
    description: 'View, create, replace, and patch secret values.',
    dangerous: false,
    data: ['create', 'read', 'update', 'patch'],
    metadata: ['read', 'list'],
    deleteVersions: [],
    undeleteVersions: [],
    destroyVersions: [],
  },
  'manage-versions': {
    label: 'Manage versions',
    description: 'Edit secrets, soft-delete versions, and restore deleted versions.',
    dangerous: false,
    data: ['create', 'read', 'update', 'patch', 'delete'],
    metadata: ['read', 'list'],
    deleteVersions: ['update'],
    undeleteVersions: ['update'],
    destroyVersions: [],
  },
  owner: {
    label: 'Owner',
    description: 'Manage versions, permanently destroy versions, and delete metadata.',
    dangerous: true,
    data: ['create', 'read', 'update', 'patch', 'delete'],
    metadata: ['read', 'delete', 'list'],
    deleteVersions: ['update'],
    undeleteVersions: ['update'],
    destroyVersions: ['update'],
  },
  deny: {
    label: 'Deny',
    description: 'Explicitly deny data, metadata, and version operations at this path.',
    dangerous: true,
    data: ['deny'],
    metadata: ['deny'],
    deleteVersions: ['deny'],
    undeleteVersions: ['deny'],
    destroyVersions: ['deny'],
  },
};
