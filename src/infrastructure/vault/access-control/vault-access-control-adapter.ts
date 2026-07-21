import type {
  CreateVaultEntity,
  CreateVaultEntityAlias,
  CreateVaultUserpassAccount,
  VaultAccessControlGateway,
  VaultAclPolicy,
  VaultAuthMount,
  VaultIdentityAlias,
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultSession,
  VaultUserpassAccount,
} from '../../../domain/vault/contracts';
import { VaultError } from '../../../domain/vault/errors';
import { encodeVaultPath, VaultHttpClient } from '../http/vault-http-client';
import {
  asArray,
  asObject,
  asString,
  asStringArray,
  optionalBoolean,
  optionalString,
  optionalStringArray,
  optionalStringRecord,
} from '../http/validation';

function sessionRequest(session: VaultSession, signal?: AbortSignal) {
  return { token: session.token, signal } as const;
}

function parseAlias(value: unknown, fallbackCanonicalId: string): VaultIdentityAlias {
  const alias = asObject(value);
  return {
    id: asString(alias.id),
    name: asString(alias.name),
    canonicalId: optionalString(alias.canonical_id) ?? fallbackCanonicalId,
    mountAccessor: asString(alias.mount_accessor),
  };
}

function parseEntity(value: unknown): VaultIdentityEntity {
  const entity = asObject(value);
  const id = asString(entity.id);
  return {
    id,
    name: asString(entity.name),
    disabled: optionalBoolean(entity.disabled),
    policies: optionalStringArray(entity.policies),
    groupIds: optionalStringArray(entity.group_ids),
    aliases: entity.aliases === null || entity.aliases === undefined
      ? []
      : asArray(entity.aliases).map((alias) => parseAlias(alias, id)),
  };
}

export class VaultAccessControlAdapter implements VaultAccessControlGateway {
  private readonly client: VaultHttpClient;

  constructor(client = new VaultHttpClient()) {
    this.client = client;
  }

  async listAuthMounts(session: VaultSession, signal?: AbortSignal): Promise<readonly VaultAuthMount[]> {
    const response = asObject(
      await this.client.request(session.serverUrl, 'sys/auth', sessionRequest(session, signal)),
    );
    return Object.entries(asObject(response.data)).map(([path, value]) => {
      const mount = asObject(value);
      return {
        path: path.replace(/\/+$/, ''),
        accessor: asString(mount.accessor),
        type: asString(mount.type),
        description: optionalString(mount.description) ?? '',
      };
    });
  }

  async listPolicies(session: VaultSession, signal?: AbortSignal): Promise<readonly string[]> {
    const response = asObject(
      await this.client.request(session.serverUrl, 'sys/policy', sessionRequest(session, signal)),
    );
    if (response.policies !== undefined) return asStringArray(response.policies);
    return asStringArray(asObject(response.data).keys);
  }

  async readPolicy(
    session: VaultSession,
    name: string,
    signal?: AbortSignal,
  ): Promise<VaultAclPolicy> {
    const response = asObject(
      await this.client.request(
        session.serverUrl,
        `sys/policy/${encodeURIComponent(name)}`,
        sessionRequest(session, signal),
      ),
    );
    const data = response.data === undefined ? response : asObject(response.data);
    return {
      name: optionalString(data.name) ?? name,
      policy: asString(data.rules ?? data.policy),
    };
  }

  async writePolicy(
    session: VaultSession,
    policy: VaultAclPolicy,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.client.request(session.serverUrl, `sys/policy/${encodeURIComponent(policy.name)}`, {
      method: 'POST',
      token: session.token,
      body: { policy: policy.policy },
      signal,
    });
  }

  async deletePolicy(session: VaultSession, name: string, signal?: AbortSignal): Promise<void> {
    await this.client.request(session.serverUrl, `sys/policy/${encodeURIComponent(name)}`, {
      method: 'DELETE',
      token: session.token,
      signal,
    });
  }

  async listGroups(session: VaultSession, signal?: AbortSignal): Promise<readonly VaultIdentityGroup[]> {
    let response: Record<string, unknown>;
    try {
      response = asObject(
        await this.client.request(session.serverUrl, 'identity/group/id', {
          token: session.token,
          query: { list: true },
          signal,
        }),
      );
    } catch (error) {
      if (error instanceof VaultError && error.code === 'not-found') return [];
      throw error;
    }
    const ids = asStringArray(asObject(response.data).keys);
    const groups = await Promise.all(
      ids.map(async (id): Promise<VaultIdentityGroup | null> => {
        const groupResponse = asObject(
          await this.client.request(
            session.serverUrl,
            `identity/group/id/${encodeURIComponent(id)}`,
            sessionRequest(session, signal),
          ),
        );
        const group = asObject(groupResponse.data);
        if (asString(group.type) !== 'internal') return null;
        return {
          id: asString(group.id),
          name: asString(group.name),
          policies: optionalStringArray(group.policies),
          memberEntityIds: optionalStringArray(group.member_entity_ids),
          memberGroupIds: optionalStringArray(group.member_group_ids),
          metadata: optionalStringRecord(group.metadata),
        };
      }),
    );
    return groups.filter((group): group is VaultIdentityGroup => group !== null);
  }

  async updateGroupMembers(
    session: VaultSession,
    group: VaultIdentityGroup,
    memberEntityIds: readonly string[],
    signal?: AbortSignal,
  ): Promise<void> {
    await this.client.request(
      session.serverUrl,
      `identity/group/id/${encodeURIComponent(group.id)}`,
      {
        method: 'POST',
        token: session.token,
        body: {
          name: group.name,
          type: 'internal',
          policies: group.policies,
          member_entity_ids: memberEntityIds,
          member_group_ids: group.memberGroupIds,
          metadata: group.metadata,
        },
        signal,
      },
    );
  }

  async listUserpassAccounts(
    session: VaultSession,
    mount: string,
    signal?: AbortSignal,
  ): Promise<readonly VaultUserpassAccount[]> {
    const mountPath = encodeVaultPath(mount);
    let response: Record<string, unknown>;
    try {
      response = asObject(
        await this.client.request(session.serverUrl, `auth/${mountPath}/users`, {
          token: session.token,
          query: { list: true },
          signal,
        }),
      );
    } catch (error) {
      if (error instanceof VaultError && error.code === 'not-found') return [];
      throw error;
    }
    const usernames = asStringArray(asObject(response.data).keys);
    return Promise.all(
      usernames.map(async (username) => {
        const accountResponse = asObject(
          await this.client.request(
            session.serverUrl,
            `auth/${mountPath}/users/${encodeURIComponent(username)}`,
            sessionRequest(session, signal),
          ),
        );
        const account = asObject(accountResponse.data);
        return {
          username,
          mount: encodeVaultPath(mount),
          tokenPolicies: optionalStringArray(account.token_policies ?? account.policies),
        };
      }),
    );
  }

  async createUserpassAccount(
    session: VaultSession,
    mount: string,
    account: CreateVaultUserpassAccount,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.client.request(
      session.serverUrl,
      `auth/${encodeVaultPath(mount)}/users/${encodeURIComponent(account.username)}`,
      {
        method: 'POST',
        token: session.token,
        body: { password: account.password.reveal(), token_policies: account.tokenPolicies },
        signal,
      },
    );
  }

  async deleteUserpassAccount(
    session: VaultSession,
    mount: string,
    username: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.client.request(
      session.serverUrl,
      `auth/${encodeVaultPath(mount)}/users/${encodeURIComponent(username)}`,
      { method: 'DELETE', token: session.token, signal },
    );
  }

  async readEntityByName(
    session: VaultSession,
    name: string,
    signal?: AbortSignal,
  ): Promise<VaultIdentityEntity> {
    const response = asObject(
      await this.client.request(
        session.serverUrl,
        `identity/entity/name/${encodeURIComponent(name)}`,
        sessionRequest(session, signal),
      ),
    );
    return parseEntity(response.data);
  }

  async lookupEntityByAlias(
    session: VaultSession,
    name: string,
    mountAccessor: string,
    signal?: AbortSignal,
  ): Promise<VaultIdentityEntity | null> {
    try {
      const payload = await this.client.request(session.serverUrl, 'identity/lookup/entity', {
        method: 'POST',
        token: session.token,
        body: { alias_name: name, alias_mount_accessor: mountAccessor },
        signal,
      });
      if (payload === null) return null;
      const response = asObject(payload);
      return response.data === null ? null : parseEntity(response.data);
    } catch (error) {
      if (error instanceof VaultError && error.code === 'not-found') return null;
      throw error;
    }
  }

  async createEntity(
    session: VaultSession,
    entity: CreateVaultEntity,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = asObject(
      await this.client.request(session.serverUrl, 'identity/entity', {
        method: 'POST',
        token: session.token,
        body: { name: entity.name, policies: entity.policies, metadata: entity.metadata ?? {} },
        signal,
      }),
    );
    return asString(asObject(response.data).id);
  }

  async deleteEntity(session: VaultSession, entityId: string, signal?: AbortSignal): Promise<void> {
    await this.client.request(
      session.serverUrl,
      `identity/entity/id/${encodeURIComponent(entityId)}`,
      { method: 'DELETE', token: session.token, signal },
    );
  }

  async createEntityAlias(
    session: VaultSession,
    alias: CreateVaultEntityAlias,
    signal?: AbortSignal,
  ): Promise<string> {
    const response = asObject(
      await this.client.request(session.serverUrl, 'identity/entity-alias', {
        method: 'POST',
        token: session.token,
        body: {
          name: alias.name,
          canonical_id: alias.canonicalId,
          mount_accessor: alias.mountAccessor,
          custom_metadata: alias.customMetadata ?? {},
        },
        signal,
      }),
    );
    return asString(asObject(response.data).id);
  }

  async deleteEntityAlias(
    session: VaultSession,
    aliasId: string,
    signal?: AbortSignal,
  ): Promise<void> {
    await this.client.request(
      session.serverUrl,
      `identity/entity-alias/id/${encodeURIComponent(aliasId)}`,
      { method: 'DELETE', token: session.token, signal },
    );
  }
}
