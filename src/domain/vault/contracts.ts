import type { VaultPassword, VaultToken } from './sensitive-value';

export type VaultAuthMethod = 'token' | 'userpass';

export interface VaultSession {
  readonly serverUrl: string;
  readonly token: VaultToken;
  readonly authMethod: VaultAuthMethod;
  readonly displayName?: string;
  readonly expiresAt?: number;
}

export interface VaultHealth {
  readonly initialized: boolean;
  readonly sealed: boolean;
  readonly standby: boolean;
  readonly version?: string;
}

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
  readonly currentVersion: number;
  readonly oldestVersion: number;
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
  listPaths(session: VaultSession, mount: string, path: string, signal?: AbortSignal): Promise<readonly string[]>;
  readSecret(session: VaultSession, mount: string, path: string, version?: number, signal?: AbortSignal): Promise<KvV2Secret>;
  writeSecret(
    session: VaultSession,
    mount: string,
    path: string,
    data: Readonly<Record<string, unknown>>,
    cas: number,
    signal?: AbortSignal,
  ): Promise<number>;
  readSecretHistory(session: VaultSession, mount: string, path: string, signal?: AbortSignal): Promise<KvV2SecretHistory>;
  deleteLatestVersion(session: VaultSession, mount: string, path: string, signal?: AbortSignal): Promise<void>;
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
  readonly policies: readonly string[];
  readonly memberEntityIds: readonly string[];
  readonly memberGroupIds: readonly string[];
  readonly metadata: Readonly<Record<string, string>>;
}

export interface VaultUserpassAccount {
  readonly username: string;
  readonly mount: string;
  readonly tokenPolicies: readonly string[];
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
  updateGroupMembers(session: VaultSession, group: VaultIdentityGroup, memberEntityIds: readonly string[], signal?: AbortSignal): Promise<void>;
  listUserpassAccounts(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly VaultUserpassAccount[]>;
  createUserpassAccount(session: VaultSession, mount: string, account: CreateVaultUserpassAccount, signal?: AbortSignal): Promise<void>;
  deleteUserpassAccount(session: VaultSession, mount: string, username: string, signal?: AbortSignal): Promise<void>;
  readEntityByName(session: VaultSession, name: string, signal?: AbortSignal): Promise<VaultIdentityEntity>;
  lookupEntityByAlias(session: VaultSession, name: string, mountAccessor: string, signal?: AbortSignal): Promise<VaultIdentityEntity | null>;
  createEntity(session: VaultSession, entity: CreateVaultEntity, signal?: AbortSignal): Promise<string>;
  deleteEntity(session: VaultSession, entityId: string, signal?: AbortSignal): Promise<void>;
  createEntityAlias(session: VaultSession, alias: CreateVaultEntityAlias, signal?: AbortSignal): Promise<string>;
  deleteEntityAlias(session: VaultSession, aliasId: string, signal?: AbortSignal): Promise<void>;
}
