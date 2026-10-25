import type {
  DatabaseConnection,
  DatabaseConnectionInput,
  DatabaseEngineGateway,
  DatabaseRole,
  DatabaseRoleInput,
  DatabaseStaticRole,
  DatabaseStaticRoleInput,
  LeaseRenewal,
  StaticCredentials,
  StaticRotation,
} from '@/domain/engines/database/database';
import { isDatabaseName } from '@/domain/engines/database/database-validation';
import type { VaultApiResponse } from '@/domain/engines/engines';
import type { VaultSession } from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { encodeVaultPath, VaultHttpClient, type VaultRequestOptions } from '../../vault/http/vault-http-client';
import {
  asNumber,
  asObject,
  asString,
  asStringArray,
  optionalBoolean,
  optionalNumber,
  optionalString,
  optionalStringArray,
  type JsonObject,
} from '../../vault/http/validation';

/** Keys that never leave the adapter, even though Vault does not return most of them. */
const SENSITIVE_SETTING = /password|secret|token|private|key|cert/i;
const ADDRESS_SETTINGS = ['connection_url', 'url', 'host'] as const;

function mountSegment(mount: string): string {
  const encoded = encodeVaultPath(mount);
  if (!encoded) throw new VaultError('invalid-request');
  return encoded;
}

function nameSegment(name: string): string {
  if (!isDatabaseName(name)) throw new VaultError('invalid-request');
  return encodeURIComponent(name);
}

function dataOf(response: unknown): JsonObject {
  return asObject(asObject(response).data);
}

function primitiveSettings(details: JsonObject): Record<string, string | number | boolean> {
  const settings: Record<string, string | number | boolean> = {};
  for (const [key, value] of Object.entries(details)) {
    if ((ADDRESS_SETTINGS as readonly string[]).includes(key) || key === 'username') continue;
    if (SENSITIVE_SETTING.test(key)) continue;
    if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') settings[key] = value;
  }
  return settings;
}

function parseConnection(name: string, response: unknown): DatabaseConnection {
  const data = dataOf(response);
  const details = data.connection_details === null || data.connection_details === undefined
    ? {}
    : asObject(data.connection_details);
  const address = ADDRESS_SETTINGS.map((key) => details[key]).find((value) => value !== undefined && value !== null);
  return {
    name,
    pluginName: asString(data.plugin_name),
    pluginVersion: optionalString(data.plugin_version),
    connectionUrl: optionalString(address) ?? '',
    username: optionalString(details.username) ?? '',
    allowedRoles: optionalStringArray(data.allowed_roles),
    verifyConnection: optionalBoolean(data.verify_connection, true),
    passwordPolicy: optionalString(data.password_policy) ?? '',
    rootRotationStatements: optionalStringArray(data.root_credentials_rotate_statements),
    otherSettings: primitiveSettings(details),
  };
}

function parseRole(name: string, response: unknown): DatabaseRole {
  const data = dataOf(response);
  return {
    name,
    dbName: asString(data.db_name),
    creationStatements: optionalStringArray(data.creation_statements),
    revocationStatements: optionalStringArray(data.revocation_statements),
    rollbackStatements: optionalStringArray(data.rollback_statements),
    renewStatements: optionalStringArray(data.renew_statements),
    defaultTtlSeconds: optionalNumber(data.default_ttl) ?? 0,
    maxTtlSeconds: optionalNumber(data.max_ttl) ?? 0,
    credentialType: optionalString(data.credential_type) ?? 'password',
  };
}

function parseRotation(data: JsonObject): StaticRotation {
  const schedule = optionalString(data.rotation_schedule);
  if (schedule) {
    const window = optionalNumber(data.rotation_window);
    return { kind: 'schedule', schedule, ...(window ? { windowSeconds: window } : {}) };
  }
  return { kind: 'period', periodSeconds: optionalNumber(data.rotation_period) ?? 0 };
}

function parseStaticRole(name: string, response: unknown): DatabaseStaticRole {
  const data = dataOf(response);
  return {
    name,
    dbName: asString(data.db_name),
    username: asString(data.username),
    rotation: parseRotation(data),
    rotationStatements: optionalStringArray(data.rotation_statements),
    lastVaultRotation: optionalString(data.last_vault_rotation),
    credentialType: optionalString(data.credential_type) ?? 'password',
  };
}

function parseApiResponse(response: unknown): VaultApiResponse {
  const body = asObject(response);
  const leaseId = optionalString(body.lease_id);
  return {
    data: asObject(body.data),
    leaseId,
    leaseDurationSeconds: leaseId ? optionalNumber(body.lease_duration) : undefined,
    renewable: leaseId ? optionalBoolean(body.renewable) : undefined,
    warnings: optionalStringArray(body.warnings),
  };
}

function connectionBody(input: DatabaseConnectionInput): JsonObject {
  return {
    ...input.extraSettings,
    plugin_name: input.pluginName,
    [input.urlParameter]: input.connectionUrl,
    username: input.username,
    ...(input.password ? { password: input.password.reveal() } : {}),
    allowed_roles: input.allowedRoles,
    verify_connection: input.verifyConnection,
    password_policy: input.passwordPolicy,
    root_rotation_statements: input.rootRotationStatements,
  };
}

function roleBody(input: DatabaseRoleInput): JsonObject {
  return {
    db_name: input.dbName,
    creation_statements: input.creationStatements,
    revocation_statements: input.revocationStatements,
    rollback_statements: input.rollbackStatements,
    renew_statements: input.renewStatements,
    default_ttl: input.defaultTtl || '0',
    max_ttl: input.maxTtl || '0',
  };
}

function staticRoleBody(input: DatabaseStaticRoleInput): JsonObject {
  const rotation = input.rotation.kind === 'period'
    ? { rotation_period: input.rotation.period }
    : {
        rotation_schedule: input.rotation.schedule,
        ...(input.rotation.window ? { rotation_window: input.rotation.window } : {}),
      };
  return {
    db_name: input.dbName,
    username: input.username,
    rotation_statements: input.rotationStatements,
    ...rotation,
  };
}

/**
 * Database secrets engine adapter. Writes ask the client for Vault's
 * sanitized error text so operators see why a connection failed to verify.
 */
export class VaultDatabaseAdapter implements DatabaseEngineGateway {
  private readonly client: VaultHttpClient;

  constructor(client = new VaultHttpClient()) {
    this.client = client;
  }

  private read(session: VaultSession, path: string, signal?: AbortSignal): Promise<unknown> {
    return this.client.request(session.serverUrl, path, { token: session.token, signal });
  }

  private async list(session: VaultSession, path: string, signal?: AbortSignal): Promise<readonly string[]> {
    try {
      const response = await this.client.request(session.serverUrl, path, {
        token: session.token,
        query: { list: true },
        signal,
      });
      return [...asStringArray(dataOf(response).keys)].sort((left, right) => left.localeCompare(right));
    } catch (error) {
      if (error instanceof VaultError && error.code === 'not-found') return [];
      throw error;
    }
  }

  /** Runs an operation and keeps Vault's sanitized explanation on failure. */
  private operate(
    session: VaultSession,
    path: string,
    options: Pick<VaultRequestOptions, 'method' | 'body' | 'signal'>,
  ): Promise<unknown> {
    return this.client.request(session.serverUrl, path, { ...options, token: session.token, includeReason: true });
  }

  listConnections(session: VaultSession, mount: string, signal?: AbortSignal) {
    return this.list(session, `${mountSegment(mount)}/config`, signal);
  }

  async readConnection(session: VaultSession, mount: string, name: string, signal?: AbortSignal) {
    return parseConnection(name, await this.read(session, `${mountSegment(mount)}/config/${nameSegment(name)}`, signal));
  }

  async writeConnection(session: VaultSession, mount: string, input: DatabaseConnectionInput, signal?: AbortSignal) {
    await this.operate(session, `${mountSegment(mount)}/config/${nameSegment(input.name)}`, {
      method: 'POST',
      body: connectionBody(input),
      signal,
    });
  }

  async deleteConnection(session: VaultSession, mount: string, name: string, signal?: AbortSignal) {
    await this.operate(session, `${mountSegment(mount)}/config/${nameSegment(name)}`, { method: 'DELETE', signal });
  }

  async resetConnection(session: VaultSession, mount: string, name: string, signal?: AbortSignal) {
    await this.operate(session, `${mountSegment(mount)}/reset/${nameSegment(name)}`, { method: 'POST', signal });
  }

  async rotateRootCredentials(session: VaultSession, mount: string, name: string, signal?: AbortSignal) {
    await this.operate(session, `${mountSegment(mount)}/rotate-root/${nameSegment(name)}`, { method: 'POST', signal });
  }

  listRoles(session: VaultSession, mount: string, signal?: AbortSignal) {
    return this.list(session, `${mountSegment(mount)}/roles`, signal);
  }

  async readRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal) {
    return parseRole(name, await this.read(session, `${mountSegment(mount)}/roles/${nameSegment(name)}`, signal));
  }

  async writeRole(session: VaultSession, mount: string, input: DatabaseRoleInput, signal?: AbortSignal) {
    await this.operate(session, `${mountSegment(mount)}/roles/${nameSegment(input.name)}`, {
      method: 'POST',
      body: roleBody(input),
      signal,
    });
  }

  async deleteRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal) {
    await this.operate(session, `${mountSegment(mount)}/roles/${nameSegment(name)}`, { method: 'DELETE', signal });
  }

  async generateCredentials(session: VaultSession, mount: string, role: string, signal?: AbortSignal) {
    const response = parseApiResponse(
      await this.operate(session, `${mountSegment(mount)}/creds/${nameSegment(role)}`, { method: 'GET', signal }),
    );
    if (!response.leaseId) throw new VaultError('invalid-response');
    return response;
  }

  async renewLease(session: VaultSession, leaseId: string, increment?: string, signal?: AbortSignal): Promise<LeaseRenewal> {
    const response = asObject(await this.operate(session, 'sys/leases/renew', {
      method: 'PUT',
      body: { lease_id: leaseId, ...(increment ? { increment } : {}) },
      signal,
    }));
    return {
      leaseId: asString(response.lease_id),
      leaseDurationSeconds: asNumber(response.lease_duration),
      renewable: optionalBoolean(response.renewable),
    };
  }

  async revokeLease(session: VaultSession, leaseId: string, signal?: AbortSignal) {
    await this.operate(session, 'sys/leases/revoke', { method: 'PUT', body: { lease_id: leaseId }, signal });
  }

  listStaticRoles(session: VaultSession, mount: string, signal?: AbortSignal) {
    return this.list(session, `${mountSegment(mount)}/static-roles`, signal);
  }

  async readStaticRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal) {
    return parseStaticRole(name, await this.read(session, `${mountSegment(mount)}/static-roles/${nameSegment(name)}`, signal));
  }

  async writeStaticRole(session: VaultSession, mount: string, input: DatabaseStaticRoleInput, signal?: AbortSignal) {
    await this.operate(session, `${mountSegment(mount)}/static-roles/${nameSegment(input.name)}`, {
      method: 'POST',
      body: staticRoleBody(input),
      signal,
    });
  }

  async deleteStaticRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal) {
    await this.operate(session, `${mountSegment(mount)}/static-roles/${nameSegment(name)}`, { method: 'DELETE', signal });
  }

  async readStaticCredentials(
    session: VaultSession,
    mount: string,
    name: string,
    signal?: AbortSignal,
  ): Promise<StaticCredentials> {
    const data = dataOf(await this.operate(session, `${mountSegment(mount)}/static-creds/${nameSegment(name)}`, {
      method: 'GET',
      signal,
    }));
    return {
      username: asString(data.username),
      password: asString(data.password),
      lastVaultRotation: optionalString(data.last_vault_rotation),
      ttlSeconds: optionalNumber(data.ttl) ?? 0,
      rotation: parseRotation(data),
    };
  }

  async rotateStaticRole(session: VaultSession, mount: string, name: string, signal?: AbortSignal) {
    await this.operate(session, `${mountSegment(mount)}/rotate-role/${nameSegment(name)}`, { method: 'POST', signal });
  }
}
