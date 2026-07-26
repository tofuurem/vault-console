import {
  capabilityRequirementsSatisfied,
  requiredCapabilities,
  sortChangeOperations,
} from '@/domain/access-control/lifecycle/change-plan';
import type {
  CapabilityRequirement,
  ChangeOperation,
  ChangePlan,
  DependencyVisibility,
  OperationResult,
  OperationRunState,
  PlanExecutionResult,
  RecoveryAction,
} from '@/domain/access-control/lifecycle/model';
import type {
  UpsertVaultIdentityGroup,
  VaultAccessControlGateway,
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultSession,
} from '@/domain/vault/contracts';
import {
  normalizeVaultError,
  VaultError,
} from '@/domain/vault/errors';

export interface FreshPlanState {
  readonly fingerprint: string;
  readonly visibility: DependencyVisibility;
}

export type PlanPreflightResult =
  | {
      readonly ok: true;
      readonly operations: readonly ChangeOperation[];
    }
  | {
      readonly ok: false;
      readonly reason: 'confirmation';
    }
  | {
      readonly ok: false;
      readonly reason: 'incomplete';
      readonly reasons: readonly string[];
    }
  | {
      readonly ok: false;
      readonly reason: 'stale';
      readonly freshFingerprint: string;
    }
  | {
      readonly ok: false;
      readonly reason: 'capabilities';
      readonly missing: readonly CapabilityRequirement[];
    };

export async function preflightChangePlan(input: {
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly plan: ChangePlan;
  readonly confirmation?: string;
  readonly loadFreshState: (signal?: AbortSignal) => Promise<FreshPlanState>;
  readonly signal?: AbortSignal;
}): Promise<PlanPreflightResult> {
  if (
    input.plan.confirmation?.required
    && input.confirmation !== input.plan.confirmation.value
  ) {
    return { ok: false, reason: 'confirmation' };
  }
  if (!input.plan.visibility.complete) {
    return {
      ok: false,
      reason: 'incomplete',
      reasons: input.plan.visibility.reasons,
    };
  }
  const fresh = await input.loadFreshState(input.signal);
  if (!fresh.visibility.complete) {
    return {
      ok: false,
      reason: 'incomplete',
      reasons: fresh.visibility.reasons,
    };
  }
  if (fresh.fingerprint !== input.plan.baselineFingerprint) {
    return {
      ok: false,
      reason: 'stale',
      freshFingerprint: fresh.fingerprint,
    };
  }

  const operations = sortChangeOperations(input.plan.operations);
  const requirements = requiredCapabilities(operations);
  const capabilities = requirements.length > 0
    ? await input.gateway.getCapabilities(
        input.session,
        requirements.map(({ path }) => path),
        input.signal,
      )
    : {};
  const check = capabilityRequirementsSatisfied(requirements, capabilities);
  if (!check.allowed) {
    return { ok: false, reason: 'capabilities', missing: check.missing };
  }
  return { ok: true, operations };
}

function sameStrings(
  left: readonly string[],
  right: readonly string[],
): boolean {
  return [...new Set(left)].sort().join('\u0000')
    === [...new Set(right)].sort().join('\u0000');
}

function sameMetadata(
  left: Readonly<Record<string, string>> | undefined,
  right: Readonly<Record<string, string>>,
): boolean {
  const leftEntries = Object.entries(left ?? {}).sort(([a], [b]) => a.localeCompare(b));
  const rightEntries = Object.entries(right).sort(([a], [b]) => a.localeCompare(b));
  return JSON.stringify(leftEntries) === JSON.stringify(rightEntries);
}

function groupMatches(
  actual: VaultIdentityGroup,
  expected: UpsertVaultIdentityGroup,
): boolean {
  return actual.name === expected.name
    && (actual.type ?? 'internal') === 'internal'
    && sameStrings(actual.policies, expected.policies)
    && sameStrings(actual.memberEntityIds, expected.memberEntityIds)
    && sameStrings(actual.memberGroupIds, expected.memberGroupIds)
    && sameMetadata(actual.metadata, expected.metadata);
}

function entityMatches(
  actual: VaultIdentityEntity,
  expected: Extract<ChangeOperation, { kind: 'update-entity' }>['entity'],
): boolean {
  return actual.name === expected.name
    && actual.disabled === expected.disabled
    && sameStrings(actual.policies, expected.policies)
    && sameMetadata(actual.metadata, expected.metadata);
}

async function expectNotFound(read: () => Promise<unknown>): Promise<void> {
  try {
    await read();
  } catch (cause) {
    const error = normalizeVaultError(cause);
    if (error.code === 'not-found') return;
    throw error;
  }
  throw new VaultError('conflict');
}

async function executeOperation(
  gateway: VaultAccessControlGateway,
  session: VaultSession,
  operation: ChangeOperation,
  signal?: AbortSignal,
): Promise<string | undefined> {
  switch (operation.kind) {
    case 'write-policy': {
      await gateway.writePolicy(session, operation.policy, signal);
      const verified = await gateway.readPolicy(session, operation.policy.name, signal);
      if (verified.policy.trim() !== operation.policy.policy.trim()) throw new VaultError('conflict');
      return undefined;
    }
    case 'delete-policy':
      await gateway.deletePolicy(session, operation.policyName, signal);
      await expectNotFound(() => gateway.readPolicy(session, operation.policyName, signal));
      return undefined;
    case 'update-userpass-policies': {
      await gateway.updateUserpassPolicies(
        session,
        operation.mount,
        operation.username,
        operation.policies,
        signal,
      );
      const verified = await gateway.readUserpassAccount(
        session,
        operation.mount,
        operation.username,
        signal,
      );
      if (!verified || !sameStrings(verified.tokenPolicies, operation.policies)) {
        throw new VaultError('conflict');
      }
      return undefined;
    }
    case 'reset-userpass-password':
      await gateway.resetUserpassPassword(
        session,
        operation.mount,
        operation.username,
        operation.password,
        signal,
      );
      return undefined;
    case 'delete-userpass-account':
      await gateway.deleteUserpassAccount(
        session,
        operation.mount,
        operation.username,
        signal,
      );
      if (await gateway.readUserpassAccount(
        session,
        operation.mount,
        operation.username,
        signal,
      )) throw new VaultError('conflict');
      return undefined;
    case 'update-entity': {
      await gateway.updateEntity(session, operation.entityId, operation.entity, signal);
      const verified = await gateway.readEntity(session, operation.entityId, signal);
      if (!entityMatches(verified, operation.entity)) throw new VaultError('conflict');
      return undefined;
    }
    case 'delete-entity':
      await gateway.deleteEntity(session, operation.entityId, signal);
      await expectNotFound(() => gateway.readEntity(session, operation.entityId, signal));
      return undefined;
    case 'delete-entity-alias':
      await gateway.deleteEntityAlias(session, operation.aliasId, signal);
      if (operation.entityId) {
        const entity = await gateway.readEntity(session, operation.entityId, signal);
        if (entity.aliases.some(({ id }) => id === operation.aliasId)) {
          throw new VaultError('conflict');
        }
      }
      return undefined;
    case 'create-group': {
      const groupId = await gateway.createGroup(session, operation.group, signal);
      const verified = await gateway.readGroup(session, groupId, signal);
      if (!groupMatches(verified, operation.group)) throw new VaultError('conflict');
      return groupId;
    }
    case 'update-group': {
      await gateway.updateGroup(session, operation.groupId, operation.group, signal);
      const verified = await gateway.readGroup(session, operation.groupId, signal);
      if (!groupMatches(verified, operation.group)) throw new VaultError('conflict');
      return undefined;
    }
    case 'delete-group':
      await gateway.deleteGroup(session, operation.groupId, signal);
      await expectNotFound(() => gateway.readGroup(session, operation.groupId, signal));
      return undefined;
  }
}

function blockedResult(preflight: Exclude<PlanPreflightResult, { ok: true }>): PlanExecutionResult {
  return {
    status: 'blocked',
    operations: [],
    recovery: [],
    blockReason: preflight.reason,
    ...(preflight.reason === 'capabilities'
      ? { missingRequirements: preflight.missing }
      : {}),
  };
}

function recoveryActions(
  operations: readonly ChangeOperation[],
  results: ReadonlyMap<string, OperationResult>,
  failedOperationId: string,
): readonly RecoveryAction[] {
  return operations.flatMap((operation): readonly RecoveryAction[] => {
    const state = results.get(operation.id)?.state ?? 'pending';
    if (state === 'compensated') return [];
    if (operation.id === failedOperationId) {
      return [{
        operationId: operation.id,
        summary: `Resolve the failure and retry: ${operation.label}`,
      }];
    }
    if (state === 'completed') {
      return [{
        operationId: operation.id,
        summary: `Verify the completed change before retrying: ${operation.label}`,
      }];
    }
    return [{
      operationId: operation.id,
      summary: `Apply after the failed step is resolved: ${operation.label}`,
    }];
  });
}

export class ChangePlanExecutor {
  private readonly gateway: VaultAccessControlGateway;
  private readonly session: VaultSession;
  private readonly plan: ChangePlan;
  private readonly loadFreshState: (signal?: AbortSignal) => Promise<FreshPlanState>;
  private execution?: Promise<PlanExecutionResult>;

  constructor(input: {
    readonly gateway: VaultAccessControlGateway;
    readonly session: VaultSession;
    readonly plan: ChangePlan;
    readonly loadFreshState: (signal?: AbortSignal) => Promise<FreshPlanState>;
  }) {
    this.gateway = input.gateway;
    this.session = input.session;
    this.plan = input.plan;
    this.loadFreshState = input.loadFreshState;
  }

  apply(input: {
    readonly confirmation?: string;
    readonly signal?: AbortSignal;
    readonly onProgress?: (operationId: string, state: OperationRunState) => void;
  } = {}): Promise<PlanExecutionResult> {
    if (!this.execution) this.execution = this.run(input);
    return this.execution;
  }

  private async run(input: {
    readonly confirmation?: string;
    readonly signal?: AbortSignal;
    readonly onProgress?: (operationId: string, state: OperationRunState) => void;
  }): Promise<PlanExecutionResult> {
    const preflight = await preflightChangePlan({
      gateway: this.gateway,
      session: this.session,
      plan: this.plan,
      confirmation: input.confirmation,
      loadFreshState: this.loadFreshState,
      signal: input.signal,
    });
    if (preflight.ok === false) return blockedResult(preflight);

    const results = new Map<string, OperationResult>();
    const completed: ChangeOperation[] = [];
    let failedOperationId: string | undefined;
    let errorMessage: string | undefined;

    for (const operation of preflight.operations) {
      input.onProgress?.(operation.id, 'running');
      results.set(operation.id, { operationId: operation.id, state: 'running' });
      try {
        const resourceId = await executeOperation(
          this.gateway,
          this.session,
          operation,
          input.signal,
        );
        const result: OperationResult = {
          operationId: operation.id,
          state: 'completed',
          ...(resourceId ? { resourceId } : {}),
        };
        results.set(operation.id, result);
        completed.push(operation);
        input.onProgress?.(operation.id, 'completed');
      } catch (cause) {
        const error = normalizeVaultError(cause);
        failedOperationId = operation.id;
        errorMessage = error.message;
        results.set(operation.id, { operationId: operation.id, state: 'failed' });
        input.onProgress?.(operation.id, 'failed');
        break;
      }
    }

    if (!failedOperationId) {
      return {
        status: 'completed',
        operations: preflight.operations.map((operation) => results.get(operation.id)!),
        recovery: [],
      };
    }

    const completedIds = new Set(completed.map(({ id }) => id));
    for (const operation of [...completed].reverse()) {
      const hasCompletedDependent = preflight.operations.some((candidate) => (
        completedIds.has(candidate.id) && candidate.dependsOn.includes(operation.id)
      ));
      if (operation.kind !== 'write-policy' || !operation.created || hasCompletedDependent) continue;
      input.onProgress?.(operation.id, 'compensating');
      results.set(operation.id, { operationId: operation.id, state: 'compensating' });
      try {
        await this.gateway.deletePolicy(
          this.session,
          operation.policy.name,
          input.signal,
        );
        await expectNotFound(() => this.gateway.readPolicy(
          this.session,
          operation.policy.name,
          input.signal,
        ));
        results.set(operation.id, { operationId: operation.id, state: 'compensated' });
        input.onProgress?.(operation.id, 'compensated');
      } catch {
        results.set(operation.id, {
          operationId: operation.id,
          state: 'compensation-failed',
        });
        input.onProgress?.(operation.id, 'compensation-failed');
      }
    }

    return {
      status: 'partial',
      operations: preflight.operations.map((operation) => (
        results.get(operation.id)
        ?? { operationId: operation.id, state: 'pending' }
      )),
      recovery: recoveryActions(preflight.operations, results, failedOperationId),
      failedOperationId,
      errorMessage,
    };
  }
}
