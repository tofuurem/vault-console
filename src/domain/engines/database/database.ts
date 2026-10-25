import type { VaultApiResponse } from '@/domain/engines/engines';
import type { VaultSession } from '@/domain/vault/contracts';
import type { VaultPassword } from '@/domain/vault/sensitive-value';

/** The setting a plugin reads its address from. Most use `connection_url`. */
export type DatabaseUrlParameter = 'connection_url' | 'url' | 'host';

/** A configured database connection (`<mount>/config/:name`). The password is write-only. */
export interface DatabaseConnection {
  readonly name: string;
  readonly pluginName: string;
  readonly pluginVersion?: string;
  /** Value of the plugin's address setting (`connection_url`, `url`, or `host`). */
  readonly connectionUrl: string;
  readonly username: string;
  readonly allowedRoles: readonly string[];
  readonly verifyConnection: boolean;
  readonly passwordPolicy: string;
  readonly rootRotationStatements: readonly string[];
  /** Other non-secret connection settings Vault returned, e.g. `max_open_connections`. */
  readonly otherSettings: Readonly<Record<string, string | number | boolean>>;
}

export interface DatabaseConnectionInput {
  readonly name: string;
  readonly pluginName: string;
  readonly urlParameter: DatabaseUrlParameter;
  readonly connectionUrl: string;
  readonly username: string;
  /** Write-only. Omitted keeps the password Vault already stores. */
  readonly password?: VaultPassword;
  readonly allowedRoles: readonly string[];
  readonly verifyConnection: boolean;
  readonly passwordPolicy: string;
  readonly rootRotationStatements: readonly string[];
  /** Plugin-specific settings merged into the request, e.g. `{ "port": 6379 }`. */
  readonly extraSettings: Readonly<Record<string, unknown>>;
}

/** A dynamic role: every credential request creates a new database user. */
export interface DatabaseRole {
  readonly name: string;
  readonly dbName: string;
  readonly creationStatements: readonly string[];
  readonly revocationStatements: readonly string[];
  readonly rollbackStatements: readonly string[];
  readonly renewStatements: readonly string[];
  readonly defaultTtlSeconds: number;
  readonly maxTtlSeconds: number;
  readonly credentialType: string;
}

export interface DatabaseRoleInput {
  readonly name: string;
  readonly dbName: string;
  readonly creationStatements: readonly string[];
  readonly revocationStatements: readonly string[];
  readonly rollbackStatements: readonly string[];
  readonly renewStatements: readonly string[];
  /** Vault durations; empty uses the mount default. */
  readonly defaultTtl: string;
  readonly maxTtl: string;
}

export type StaticRotation =
  | { readonly kind: 'period'; readonly periodSeconds: number }
  | { readonly kind: 'schedule'; readonly schedule: string; readonly windowSeconds?: number };

/** A static role: Vault owns the password of one existing database user and rotates it. */
export interface DatabaseStaticRole {
  readonly name: string;
  readonly dbName: string;
  readonly username: string;
  readonly rotation: StaticRotation;
  readonly rotationStatements: readonly string[];
  /** RFC 3339 timestamp of the last rotation Vault performed. */
  readonly lastVaultRotation?: string;
  readonly credentialType: string;
}

export type StaticRotationInput =
  | { readonly kind: 'period'; readonly period: string }
  | { readonly kind: 'schedule'; readonly schedule: string; readonly window: string };

export interface DatabaseStaticRoleInput {
  readonly name: string;
  readonly dbName: string;
  readonly username: string;
  readonly rotation: StaticRotationInput;
  readonly rotationStatements: readonly string[];
}

/** The current password of a static role. Keep in component state only. */
export interface StaticCredentials {
  readonly username: string;
  readonly password: string;
  readonly lastVaultRotation?: string;
  /** Seconds until the next rotation. */
  readonly ttlSeconds: number;
  readonly rotation?: StaticRotation;
}

export interface LeaseRenewal {
  readonly leaseId: string;
  readonly leaseDurationSeconds: number;
  readonly renewable: boolean;
}

/** Everything the database workspace needs from Vault, scoped to one mount. */
export interface DatabaseEngineGateway {
  listConnections(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly string[]>;
  readConnection(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<DatabaseConnection>;
  writeConnection(session: VaultSession, mount: string, input: DatabaseConnectionInput, signal?: AbortSignal): Promise<void>;
  deleteConnection(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void>;
  resetConnection(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void>;
  rotateRootCredentials(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void>;

  listRoles(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly string[]>;
  readRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<DatabaseRole>;
  writeRole(session: VaultSession, mount: string, input: DatabaseRoleInput, signal?: AbortSignal): Promise<void>;
  deleteRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void>;
  /** Creates a new database user. The response carries the lease. */
  generateCredentials(session: VaultSession, mount: string, role: string, signal?: AbortSignal): Promise<VaultApiResponse>;
  renewLease(session: VaultSession, leaseId: string, increment?: string, signal?: AbortSignal): Promise<LeaseRenewal>;
  revokeLease(session: VaultSession, leaseId: string, signal?: AbortSignal): Promise<void>;

  listStaticRoles(session: VaultSession, mount: string, signal?: AbortSignal): Promise<readonly string[]>;
  readStaticRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<DatabaseStaticRole>;
  writeStaticRole(session: VaultSession, mount: string, input: DatabaseStaticRoleInput, signal?: AbortSignal): Promise<void>;
  deleteStaticRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void>;
  readStaticCredentials(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<StaticCredentials>;
  rotateStaticRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal): Promise<void>;
}
