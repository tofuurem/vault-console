import type {
  UpdateVaultEntity,
  UpsertVaultIdentityGroup,
  VaultAclPolicy,
  VaultCapability,
  VaultIdentityEntity,
  VaultIdentityGroup,
  VaultUserpassAccount,
} from '@/domain/vault/contracts';
import type { VaultPassword } from '@/domain/vault/sensitive-value';
import type {
  PolicyOwnershipState,
} from '@/domain/access-control/policy-ownership';

export type EffectTiming =
  | 'next-request'
  | 'next-login'
  | 'does-not-revoke'
  | 'destructive-cleanup';

export type PlanRisk = 'normal' | 'typed-confirmation';

export interface CapabilityRequirement {
  readonly path: string;
  readonly anyOf: readonly VaultCapability[];
}

export interface PermissionPoint {
  readonly pattern: string;
  readonly capability: VaultCapability;
}

export interface PermissionDiff {
  readonly added: readonly PermissionPoint[];
  readonly removed: readonly PermissionPoint[];
}

export interface DependencyVisibility {
  readonly complete: boolean;
  readonly reasons: readonly string[];
}

interface OperationBase {
  readonly id: string;
  readonly label: string;
  readonly dependsOn: readonly string[];
  readonly requirements: readonly CapabilityRequirement[];
  readonly effectTiming: EffectTiming;
  readonly risk: PlanRisk;
}

export interface WritePolicyOperation extends OperationBase {
  readonly kind: 'write-policy';
  readonly policy: VaultAclPolicy;
  readonly created: boolean;
}

export interface DeletePolicyOperation extends OperationBase {
  readonly kind: 'delete-policy';
  readonly policyName: string;
}

export interface UpdateUserpassPoliciesOperation extends OperationBase {
  readonly kind: 'update-userpass-policies';
  readonly mount: string;
  readonly username: string;
  readonly policies: readonly string[];
}

export interface ResetUserpassPasswordOperation extends OperationBase {
  readonly kind: 'reset-userpass-password';
  readonly mount: string;
  readonly username: string;
  readonly password: VaultPassword;
}

export interface DeleteUserpassAccountOperation extends OperationBase {
  readonly kind: 'delete-userpass-account';
  readonly mount: string;
  readonly username: string;
}

export interface UpdateEntityOperation extends OperationBase {
  readonly kind: 'update-entity';
  readonly entityId: string;
  readonly entity: UpdateVaultEntity;
}

export interface DeleteEntityOperation extends OperationBase {
  readonly kind: 'delete-entity';
  readonly entityId: string;
}

export interface DeleteEntityAliasOperation extends OperationBase {
  readonly kind: 'delete-entity-alias';
  readonly aliasId: string;
  readonly entityId?: string;
}

export interface CreateGroupOperation extends OperationBase {
  readonly kind: 'create-group';
  readonly group: UpsertVaultIdentityGroup;
}

export interface UpdateGroupOperation extends OperationBase {
  readonly kind: 'update-group';
  readonly groupId: string;
  readonly group: UpsertVaultIdentityGroup;
}

export interface DeleteGroupOperation extends OperationBase {
  readonly kind: 'delete-group';
  readonly groupId: string;
}

export type ChangeOperation =
  | WritePolicyOperation
  | DeletePolicyOperation
  | UpdateUserpassPoliciesOperation
  | ResetUserpassPasswordOperation
  | DeleteUserpassAccountOperation
  | UpdateEntityOperation
  | DeleteEntityOperation
  | DeleteEntityAliasOperation
  | CreateGroupOperation
  | UpdateGroupOperation
  | DeleteGroupOperation;

export interface ChangePlan {
  readonly id: string;
  readonly resourceKind: 'user' | 'group' | 'role';
  readonly resourceId: string;
  readonly baselineFingerprint: string;
  readonly visibility: DependencyVisibility;
  readonly permissionDiff: PermissionDiff;
  readonly operations: readonly ChangeOperation[];
  readonly confirmation?: {
    readonly required: true;
    readonly value: string;
    readonly reasons: readonly string[];
  };
}

export interface UserLifecycleSnapshot {
  readonly account: VaultUserpassAccount;
  readonly mountAccessor: string;
  readonly entity: VaultIdentityEntity | null;
  readonly groups: readonly VaultIdentityGroup[];
  readonly directPolicy: VaultAclPolicy | null;
  readonly directPolicyOwnership: PolicyOwnershipState | 'absent';
  readonly directPolicyEditable: boolean;
  readonly policyReferences: readonly RoleDependency[];
  readonly visibility: DependencyVisibility;
  readonly fingerprint: string;
}

export interface IdentityTombstoneSnapshot {
  readonly entity: VaultIdentityEntity;
  readonly groups: readonly VaultIdentityGroup[];
  readonly accountAbsent: boolean;
  readonly visibility: DependencyVisibility;
  readonly fingerprint: string;
}

export interface GroupLifecycleSnapshot {
  readonly group: VaultIdentityGroup | null;
  readonly entities: readonly VaultIdentityEntity[];
  readonly parentGroups: readonly RoleDependency[];
  readonly visibility: DependencyVisibility;
  readonly fingerprint: string;
}

export interface RoleDependency {
  readonly kind: 'user' | 'group';
  readonly id: string;
  readonly name: string;
}

export interface RoleLifecycleSnapshot {
  readonly policy: VaultAclPolicy | null;
  readonly ownership: PolicyOwnershipState | 'absent';
  readonly editable: boolean;
  readonly dependencies: readonly RoleDependency[];
  readonly visibility: DependencyVisibility;
  readonly fingerprint: string;
}

export type OperationRunState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'compensating'
  | 'compensated'
  | 'compensation-failed';

export interface OperationResult {
  readonly operationId: string;
  readonly state: OperationRunState;
  readonly resourceId?: string;
}

export interface RecoveryAction {
  readonly operationId: string;
  readonly summary: string;
}

export interface PlanExecutionResult {
  readonly status: 'blocked' | 'completed' | 'partial';
  readonly operations: readonly OperationResult[];
  readonly recovery: readonly RecoveryAction[];
  readonly failedOperationId?: string;
  readonly errorMessage?: string;
  readonly blockReason?: 'confirmation' | 'incomplete' | 'stale' | 'capabilities';
  readonly missingRequirements?: readonly CapabilityRequirement[];
}
