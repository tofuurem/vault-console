import type { VaultPassword, VaultToken } from './sensitive-value';
import type { CreateKvV2Mount } from './kv-mount';
import type {
  KvV2MountConfig,
  KvV2SecretMetadataInput,
  KvV2WriteStrategy,
} from './kv-v2';

export type VaultAuthMethod = 'token' | 'userpass';

export interface VaultSessionLease {
  readonly expiresAt?: number;
  readonly leaseDurationSeconds?: number;
  readonly renewable?: boolean;
  readonly renewedAt?: number;
}

export interface VaultSession extends VaultSessionLease {
  readonly serverUrl: string;
  readonly token: VaultToken;
  readonly authMethod: VaultAuthMethod;
  readonly displayName?: string;
}

export interface VaultHealth {
  readonly initialized: boolean;
  readonly sealed: boolean;
  readonly standby: boolean;
  readonly version?: string;
}

export type VaultCapability =
  | 'create'
  | 'read'
  | 'update'
  | 'patch'
  | 'delete'
  | 'list'
  | 'sudo'
  | 'subscribe'
  | 'recover'
  | 'deny'
  | 'root';

export type VaultCapabilityMap = Readonly<Record<string, readonly VaultCapability[]>>;

export interface UserpassLogin {
  readonly serverUrl: string;
  readonly mount: string;
  readonly username: string;
  readonly password: VaultPassword;
}

export interface VaultAuthGateway {
  getHealth(serverUrl: string, signal?: AbortSignal): Promise<VaultHealth>;
  validateToken(serverUrl: string, token: VaultToken, signal?: AbortSignal): Promise<VaultSession>;
  loginUserpass(input: UserpassLogin, signal?: AbortSignal): Promise<VaultSession>;
  renewSelf(session: VaultSession, signal?: AbortSignal): Promise<VaultSessionLease>;
  revokeSelf(session: VaultSession, signal?: AbortSignal): Promise<void>;
  getCapabilities(session: VaultSession, paths: readonly string[], signal?: AbortSignal): Promise<VaultCapabilityMap>;
}

export interface KvV2Mount {
  readonly path: string;
  readonly accessor: string;
  readonly description: string;
  readonly version: 2;
}

export interface KvV2SecretMetadata {
  readonly createdTime: string;
  readonly version: number;
  readonly customMetadata: Readonly<Record<string, string>>;
  readonly destroyed: boolean;
  readonly deletionTime?: string;
}

export interface KvV2VersionMetadata {
  readonly version: number;
  readonly createdTime: string;
  readonly destroyed: boolean;
  readonly deletionTime?: string;
}

export interface KvV2SecretHistory {
  readonly createdTime: string;
  readonly updatedTime: string;
  readonly currentVersion: number;
  readonly oldestVersion: number;
  readonly maxVersions: number;
  readonly casRequired: boolean;
  readonly deleteVersionAfter: string;
  readonly customMetadata: Readonly<Record<string, string>>;
  readonly versions: readonly KvV2VersionMetadata[];
}

export interface KvV2Secret {
  readonly mount: string;
  readonly path: string;
  readonly data: Readonly<Record<string, unknown>>;
  readonly metadata: KvV2SecretMetadata;
}

export interface KvV2Gateway {
  listMounts(session: VaultSession, signal?: AbortSignal): Promise<readonly KvV2Mount[]>;
  createKvV2Mount(session: VaultSession, mount: CreateKvV2Mount, signal?: AbortSignal): Promise<void>;
  listPaths(session: VaultSession, mount: string, path: string, signal?: AbortSignal): Promise<readonly string[]>;
  readSecret(session: VaultSession, mount: string, path: string, version?: number, signal?: AbortSignal): Promise<KvV2Secret>;
  writeSecret(
    session: VaultSession,
    mount: string,
    path: string,
    data: Readonly<Record<string, unknown>>,
    strategy: KvV2WriteStrategy,
    signal?: AbortSignal,
  ): Promise<number>;
  readSecretMetadata(session: VaultSession, mount: string, path: string, signal?: AbortSignal): Promise<KvV2SecretHistory>;
  updateSecretMetadata(
    session: VaultSession,
    mount: string,
    path: string,
    input: KvV2SecretMetadataInput,
    signal?: AbortSignal,
  ): Promise<void>;
  readMountConfig(session: VaultSession, mount: string, signal?: AbortSignal): Promise<KvV2MountConfig>;
  updateMountConfig(
    session: VaultSession,
    mount: string,
    input: KvV2MountConfig,
    signal?: AbortSignal,
  ): Promise<void>;
  deleteLatestSecret(session: VaultSession, mount: string, path: string, signal?: AbortSignal): Promise<void>;
  deleteVersions(session: VaultSession, mount: string, path: string, versions: readonly number[], signal?: AbortSignal): Promise<void>;
  undeleteVersions(session: VaultSession, mount: string, path: string, versions: readonly number[], signal?: AbortSignal): Promise<void>;
  destroyVersions(session: VaultSession, mount: string, path: string, versions: readonly number[], signal?: AbortSignal): Promise<void>;
  deleteMetadata(session: VaultSession, mount: string, path: string, signal?: AbortSignal): Promise<void>;
}

export interface VaultAclPolicy {
  readonly name: string;
  readonly policy: string;
}

export interface VaultIdentityGroup {
  readonly id: string;
  readonly name: string;
  readonly type?: 'internal' | 'external';
  readonly policies: readonly string[];
  readonly memberEntityIds: readonly string[];
  readonly memberGroupIds: readonly string[];
  readonly metadata: Readonly<Record<string, string>>;
}

export interface VaultUserpassAccount {
  readonly username: string;
  readonly mount: string;
  readonly tokenPolicies: readonly string[];
  readonly tokenTtlSeconds?: number;
  readonly tokenMaxTtlSeconds?: number;
  readonly tokenExplicitMaxTtlSeconds?: number;
  readonly tokenBoundCidrs?: readonly string[];
  readonly tokenType?: string;
  readonly tokenNumUses?: number;
  readonly tokenPeriodSeconds?: number;
  readonly tokenNoDefaultPolicy?: boolean;
}

export interface VaultAuthMount {
  readonly path: string;
  readonly accessor: string;
  readonly type: string;
  readonly description: string;
}

export interface VaultIdentityAlias {
  readonly id: string;
  readonly name: string;
  readonly canonicalId: string;
  readonly mountAccessor: string;
}

export interface VaultIdentityEntity {
  readonly id: string;
  readonly name: string;
  readonly disabled: boolean;
  readonly policies: readonly string[];
  readonly groupIds: readonly string[];
  readonly aliases: readonly VaultIdentityAlias[];
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface CreateVaultEntity {
  readonly name: string;
  readonly policies: readonly string[];
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface CreateVaultEntityAlias {
  readonly name: string;
  readonly canonicalId: string;
  readonly mountAccessor: string;
  readonly customMetadata?: Readonly<Record<string, string>>;
}

export interface UpdateVaultEntity {
  readonly name: string;
  readonly disabled: boolean;
  readonly policies: readonly string[];
  readonly metadata: Readonly<Record<string, string>>;
}

export interface UpsertVaultIdentityGroup {
  readonly name: string;
  readonly policies: readonly string[];
  readonly memberEntityIds: readonly string[];
  readonly memberGroupIds: readonly string[];
  readonly metadata: Readonly<Record<string, string>>;
}

export interface CreateVaultUserpassAccount {
  readonly username: string;
  readonly password: VaultPassword;
  readonly tokenPolicies: readonly string[];
}

export interface VaultAccessControlGateway {
  listAuthMounts(session: VaultSession, signal?: AbortSignal): Promise<readonly VaultAuthMount[]>;
  listPolicies(session: VaultSession, signal?: AbortSignal): Promise<readonly string[]>;
  readPolicy(session: VaultSession, name: string, signal?: AbortSignal): Promise<VaultAclPolicy>;
  writePolicy(session: VaultSession, policy: VaultAclPolicy, signal?: AbortSignal): Promise<void>;
  deletePolicy(session: VaultSession, name: string, signal?: AbortSignal): Promise<void>;
  listGroups(session: VaultSession, signal?: AbortSignal): Promise<readonly VaultIdentityGroup[]>;
  readGroup(session: VaultSession, groupId: string, signal?: AbortSignal): Promise<VaultIdentityGroup>;
  createGroup(session: VaultSession, group: UpsertVaultIdentityGroup, signal?: AbortSignal): Promise<string>;
  updateGroup(session: VaultSession, groupId: string, group: UpsertVaultIdentityGroup, signal?: AbortSignal): Promise<void>;
  deleteGroup(session: VaultSession, groupId: string, signal?: AbortSignal): Promise<void>;
  updateGroupMembers(session: VaultSession, group: VaultIdentityGroup, memberEntityIds: readonly string[], signal?: AbortSignal): Promise<void>;
  listUserpassAccounts(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly VaultUserpassAccount[]>;
  readUserpassAccount(session: VaultSession, mount: string, username: string, signal?: AbortSignal): Promise<VaultUserpassAccount | null>;
  createUserpassAccount(session: VaultSession, mount: string, account: CreateVaultUserpassAccount, signal?: AbortSignal): Promise<void>;
  updateUserpassPolicies(session: VaultSession, mount: string, username: string, policies: readonly string[], signal?: AbortSignal): Promise<void>;
  resetUserpassPassword(session: VaultSession, mount: string, username: string, password: VaultPassword, signal?: AbortSignal): Promise<void>;
  deleteUserpassAccount(session: VaultSession, mount: string, username: string, signal?: AbortSignal): Promise<void>;
  listEntities(session: VaultSession, signal?: AbortSignal): Promise<readonly VaultIdentityEntity[]>;
  readEntityByName(session: VaultSession, name: string, signal?: AbortSignal): Promise<VaultIdentityEntity>;
  readEntity(session: VaultSession, entityId: string, signal?: AbortSignal): Promise<VaultIdentityEntity>;
  lookupEntityByAlias(session: VaultSession, name: string, mountAccessor: string, signal?: AbortSignal): Promise<VaultIdentityEntity | null>;
  createEntity(session: VaultSession, entity: CreateVaultEntity, signal?: AbortSignal): Promise<string>;
  updateEntity(session: VaultSession, entityId: string, entity: UpdateVaultEntity, signal?: AbortSignal): Promise<void>;
  deleteEntity(session: VaultSession, entityId: string, signal?: AbortSignal): Promise<void>;
  createEntityAlias(session: VaultSession, alias: CreateVaultEntityAlias, signal?: AbortSignal): Promise<string>;
  deleteEntityAlias(session: VaultSession, aliasId: string, signal?: AbortSignal): Promise<void>;
  getCapabilities(session: VaultSession, paths: readonly string[], signal?: AbortSignal): Promise<VaultCapabilityMap>;
}
