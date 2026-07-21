import { useEffect, useReducer, useState } from 'react';

import type {
  VaultAclPolicy,
  VaultAuthMount,
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultSession,
  VaultUserpassAccount,
} from '@/domain/vault/contracts';
import {
  classifyPolicyName,
  managedRoleName,
  parseManagedPolicyHcl,
  type ManagedPolicyKind,
} from '@/domain/access-control/managed-resources';
import type { AccessPolicyRule } from '@/domain/access-control/effective-access';
import { normalizeVaultError } from '@/domain/vault/errors';
import { useAccessControlGateway } from './AccessControlGatewayContext';
import type { VaultQueryState } from './useKvExplorerData';

export interface AccessPolicyRecord {
  readonly name: string;
  readonly kind: ManagedPolicyKind;
  readonly hcl?: string;
  readonly rules: readonly AccessPolicyRule[] | null;
  readonly readable: boolean;
}

export interface AccessControlRoleRecord {
  readonly id: string;
  readonly name: string;
  readonly policyName: string;
  readonly rules: readonly AccessPolicyRule[] | null;
}

export interface AccessControlUserRecord {
  readonly id: string;
  readonly username: string;
  readonly displayName: string;
  readonly mount: string;
  readonly mountAccessor: string;
  readonly tokenPolicies: readonly string[];
  readonly entity: VaultIdentityEntity | null;
  readonly groups: readonly VaultIdentityGroup[];
  readonly directRolePolicyNames: readonly string[];
  readonly directPolicyNames: readonly string[];
  readonly externalPolicyNames: readonly string[];
}

export interface AccessControlSnapshot {
  readonly authMounts: readonly VaultAuthMount[];
  readonly userpassMounts: readonly VaultAuthMount[];
  readonly groups: readonly VaultIdentityGroup[];
  readonly policies: readonly AccessPolicyRecord[];
  readonly roles: readonly AccessControlRoleRecord[];
  readonly users: readonly AccessControlUserRecord[];
  readonly warnings: readonly string[];
}

function unique(values: readonly string[]): readonly string[] {
  return [...new Set(values)];
}

async function readPolicies(
  names: readonly string[],
  read: (name: string) => Promise<VaultAclPolicy>,
): Promise<readonly AccessPolicyRecord[]> {
  return Promise.all(names.map(async (name) => {
    const kind = classifyPolicyName(name);
    try {
      const policy = await read(name);
      return {
        name,
        kind,
        hcl: policy.policy,
        rules: kind === 'external' ? null : parseManagedPolicyHcl(policy.policy),
        readable: true,
      };
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired' || error.code === 'aborted') throw error;
      return { name, kind, rules: null, readable: false };
    }
  }));
}

export async function loadAccessControlSnapshot(
  gateway: ReturnType<typeof useAccessControlGateway>,
  session: VaultSession,
  signal?: AbortSignal,
): Promise<AccessControlSnapshot> {
  const [authMounts, policyNames, groups] = await Promise.all([
    gateway.listAuthMounts(session, signal),
    gateway.listPolicies(session, signal),
    gateway.listGroups(session, signal),
  ]);
  const userpassMounts = authMounts.filter((mount) => mount.type === 'userpass');
  const warnings: string[] = [];
  const accountResults = await Promise.all(userpassMounts.map(async (mount) => {
    try {
      return await gateway.listUserpassAccounts(session, mount.path, signal);
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired' || error.code === 'aborted') throw error;
      warnings.push(`Accounts at auth/${mount.path} could not be listed with this token.`);
      return [];
    }
  }));
  const accounts = accountResults.flat();
  const policies = await readPolicies(policyNames, (name) => gateway.readPolicy(session, name, signal));
  const users = await Promise.all(accounts.map(async (account): Promise<AccessControlUserRecord> => {
    const mount = userpassMounts.find((candidate) => candidate.path === account.mount)!;
    let entity: VaultIdentityEntity | null = null;
    try {
      entity = await gateway.lookupEntityByAlias(session, account.username, mount.accessor, signal);
    } catch (cause) {
      const error = normalizeVaultError(cause);
      if (error.code === 'session-expired' || error.code === 'aborted') throw error;
      warnings.push(`Identity alias for ${account.mount}/${account.username} could not be resolved.`);
    }
    const attachedPolicies = unique([...account.tokenPolicies, ...(entity?.policies ?? [])]);
    const directRolePolicyNames = attachedPolicies.filter((name) => classifyPolicyName(name) === 'role');
    const directPolicyNames = attachedPolicies.filter((name) => classifyPolicyName(name) === 'user-direct');
    const externalPolicyNames = attachedPolicies.filter((name) => classifyPolicyName(name) === 'external' && name !== 'default');
    const userGroups = groups.filter((group) => (
      (entity ? group.memberEntityIds.includes(entity.id) || entity.groupIds.includes(group.id) : false)
    ));
    return {
      id: `${account.mount}:${account.username}`,
      username: account.username,
      displayName: entity?.name ?? account.username,
      mount: account.mount,
      mountAccessor: mount.accessor,
      tokenPolicies: account.tokenPolicies,
      entity,
      groups: userGroups,
      directRolePolicyNames,
      directPolicyNames,
      externalPolicyNames,
    };
  }));
  const roles = policies.filter((policy) => policy.kind === 'role').map((policy) => ({
    id: policy.name,
    name: managedRoleName(policy.name),
    policyName: policy.name,
    rules: policy.rules,
  }));
  return {
    authMounts,
    userpassMounts,
    groups,
    policies,
    roles,
    users: users.sort((left, right) => left.username.localeCompare(right.username)),
    warnings,
  };
}

export function useAccessControlData(session: VaultSession): readonly [VaultQueryState<AccessControlSnapshot>, () => void] {
  const gateway = useAccessControlGateway();
  const [refreshSignal, refresh] = useReducer((value: number) => value + 1, 0);
  const [state, setState] = useState<VaultQueryState<AccessControlSnapshot>>({ status: 'loading' });
  useEffect(() => {
    const controller = new AbortController();
    setState((current) => ({ status: 'loading', data: current.data }));
    loadAccessControlSnapshot(gateway, session, controller.signal).then(
      (snapshot) => setState({ status: 'success', data: snapshot }),
      (cause) => {
        const error = normalizeVaultError(cause);
        if (error.code !== 'aborted') setState((current) => ({ status: 'error', error, data: current.data }));
      },
    );
    return () => controller.abort();
  }, [gateway, refreshSignal, session]);
  return [state, refresh];
}
