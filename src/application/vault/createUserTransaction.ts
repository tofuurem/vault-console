import type { AccessControlSnapshot } from './useAccessControlData';
import type {
  VaultAccessControlGateway,
  VaultIdentityGroup,
  VaultSession,
} from '@/domain/vault/contracts';
import { VaultError } from '@/domain/vault/errors';
import { vaultPassword } from '@/domain/vault/sensitive-value';
import type { ApplyUserContext, WorkflowOperation } from '@/pages/access-control/components/create-user/workflow';

export interface CreateUserTransactionInput {
  readonly username: string;
  readonly displayName: string;
  readonly userpassMount: string;
  readonly password: string;
  readonly directRolePolicyNames: readonly string[];
  readonly directPolicy?: { readonly name: string; readonly hcl: string };
  readonly groups: readonly VaultIdentityGroup[];
}

interface TransactionState {
  preflightComplete: boolean;
  mountAccessor?: string;
  policyCreated: boolean;
  accountCreated: boolean;
  entityId?: string;
  aliasId?: string;
  groupIds: Set<string>;
}

export function createUserOperationPlan(input: CreateUserTransactionInput): readonly Omit<WorkflowOperation, 'state'>[] {
  return [
    { id: 'preflight', label: 'Check username, entity, alias, mount, and policy collisions' },
    ...(input.directPolicy ? [{ id: 'policy', label: `Create managed policy ${input.directPolicy.name}` }] : []),
    { id: 'account', label: `Create userpass account at auth/${input.userpassMount} and attach direct access` },
    { id: 'entity', label: 'Create identity entity' },
    { id: 'alias', label: 'Bind the userpass username to the identity entity' },
    ...(input.groups.length ? [{ id: 'groups', label: `Add entity to ${input.groups.length} internal group${input.groups.length === 1 ? '' : 's'}` }] : []),
  ];
}

export class CreateUserTransaction {
  private readonly gateway: VaultAccessControlGateway;
  private readonly session: VaultSession;
  private readonly input: CreateUserTransactionInput;
  private readonly state: TransactionState = {
    preflightComplete: false,
    policyCreated: false,
    accountCreated: false,
    groupIds: new Set(),
  };

  constructor(
    gateway: VaultAccessControlGateway,
    session: VaultSession,
    _snapshot: AccessControlSnapshot,
    input: CreateUserTransactionInput,
  ) {
    this.gateway = gateway;
    this.session = session;
    this.input = input;
  }

  async apply({ report, signal }: ApplyUserContext): Promise<void> {
    await this.run('preflight', report, async () => this.preflight(signal));
    if (this.input.directPolicy) {
      await this.run('policy', report, async () => {
        if (this.state.policyCreated) return;
        await this.gateway.writePolicy(this.session, {
          name: this.input.directPolicy!.name,
          policy: this.input.directPolicy!.hcl,
        }, signal);
        this.state.policyCreated = true;
      });
    }
    await this.run('account', report, async () => {
      if (this.state.accountCreated) return;
      await this.gateway.createUserpassAccount(this.session, this.input.userpassMount, {
        username: this.input.username,
        password: vaultPassword(this.input.password),
        tokenPolicies: [
          'default',
          ...this.input.directRolePolicyNames,
          ...(this.input.directPolicy ? [this.input.directPolicy.name] : []),
        ],
      }, signal);
      this.state.accountCreated = true;
    });
    await this.run('entity', report, async () => {
      if (this.state.entityId) return;
      this.state.entityId = await this.gateway.createEntity(this.session, {
        name: this.input.displayName.trim() || this.input.username,
        policies: [],
        metadata: {
          managed_by: 'vault-console',
          username: this.input.username,
          auth_mount: this.input.userpassMount,
        },
      }, signal);
    });
    await this.run('alias', report, async () => {
      if (this.state.aliasId) return;
      this.state.aliasId = await this.gateway.createEntityAlias(this.session, {
        name: this.input.username,
        canonicalId: this.state.entityId!,
        mountAccessor: this.state.mountAccessor!,
      }, signal);
    });
    if (this.input.groups.length) {
      await this.run('groups', report, async () => {
        for (const group of this.input.groups) {
          const current = await this.gateway.readGroup(this.session, group.id, signal);
          if (
            this.state.groupIds.has(group.id)
            && current.memberEntityIds.includes(this.state.entityId!)
          ) continue;
          await this.gateway.updateGroupMembers(
            this.session,
            current,
            [...new Set([...current.memberEntityIds, this.state.entityId!])],
            signal,
          );
          const verified = await this.gateway.readGroup(this.session, group.id, signal);
          if (!verified.memberEntityIds.includes(this.state.entityId!)) {
            throw new VaultError('conflict');
          }
          this.state.groupIds.add(group.id);
        }
      });
    }
  }

  async rollback({ report, signal }: ApplyUserContext): Promise<void> {
    const failures: unknown[] = [];
    const compensate = async (id: string, action: () => Promise<void>) => {
      report(id, 'compensating');
      try {
        await action();
        report(id, 'compensated');
      } catch (cause) {
        failures.push(cause);
        report(id, 'compensation-failed');
      }
    };
    if (this.state.groupIds.size && this.state.entityId) {
      await compensate('groups', async () => {
        for (const group of [...this.input.groups].reverse()) {
          if (!this.state.groupIds.has(group.id)) continue;
          const current = await this.gateway.readGroup(this.session, group.id, signal);
          await this.gateway.updateGroupMembers(
            this.session,
            current,
            current.memberEntityIds.filter((id) => id !== this.state.entityId),
            signal,
          );
          const verified = await this.gateway.readGroup(this.session, group.id, signal);
          if (verified.memberEntityIds.includes(this.state.entityId)) {
            throw new VaultError('conflict');
          }
          this.state.groupIds.delete(group.id);
        }
      });
    }
    if (this.state.aliasId) await compensate('alias', async () => {
      await this.gateway.deleteEntityAlias(this.session, this.state.aliasId!, signal);
      this.state.aliasId = undefined;
    });
    if (this.state.entityId) await compensate('entity', async () => {
      await this.gateway.deleteEntity(this.session, this.state.entityId!, signal);
      this.state.entityId = undefined;
    });
    if (this.state.accountCreated) await compensate('account', async () => {
      await this.gateway.deleteUserpassAccount(this.session, this.input.userpassMount, this.input.username, signal);
      this.state.accountCreated = false;
    });
    if (this.state.policyCreated && this.input.directPolicy) await compensate('policy', async () => {
      await this.gateway.deletePolicy(this.session, this.input.directPolicy!.name, signal);
      this.state.policyCreated = false;
    });
    this.state.preflightComplete = false;
    if (failures.length) throw new VaultError('unknown', { cause: failures[0] });
  }

  private async preflight(signal?: AbortSignal): Promise<void> {
    if (this.state.preflightComplete) return;
    const authMounts = await this.gateway.listAuthMounts(this.session, signal);
    const mount = authMounts.find((candidate) => (
      candidate.path === this.input.userpassMount && candidate.type === 'userpass'
    ));
    if (!mount) throw new VaultError('invalid-request');
    this.state.mountAccessor = mount.accessor;
    if (!this.state.accountCreated) {
      const account = await this.gateway.readUserpassAccount(
        this.session,
        this.input.userpassMount,
        this.input.username,
        signal,
      );
      if (account) throw new VaultError('conflict');
    }
    if (!this.state.policyCreated && this.input.directPolicy) {
      try {
        await this.gateway.readPolicy(
          this.session,
          this.input.directPolicy.name,
          signal,
        );
        throw new VaultError('conflict');
      } catch (cause) {
        if (!(cause instanceof VaultError) || cause.code !== 'not-found') throw cause;
      }
    }
    if (!this.state.aliasId) {
      const alias = await this.gateway.lookupEntityByAlias(
        this.session,
        this.input.username,
        mount.accessor,
        signal,
      );
      if (alias) throw new VaultError('conflict');
    }
    if (!this.state.entityId) {
      try {
        await this.gateway.readEntityByName(
          this.session,
          this.input.displayName.trim() || this.input.username,
          signal,
        );
        throw new VaultError('conflict');
      } catch (cause) {
        if (!(cause instanceof VaultError) || cause.code !== 'not-found') throw cause;
      }
    }
    for (const group of this.input.groups) {
      await this.gateway.readGroup(this.session, group.id, signal);
    }
    this.state.preflightComplete = true;
  }

  private async run(
    id: string,
    report: ApplyUserContext['report'],
    action: () => Promise<void>,
  ): Promise<void> {
    report(id, 'running');
    try {
      await action();
      report(id, 'completed');
    } catch (cause) {
      report(id, 'failed');
      throw cause;
    }
  }
}
