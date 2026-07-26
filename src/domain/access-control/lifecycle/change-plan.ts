import type {
  VaultCapability,
  VaultCapabilityMap,
} from '@/domain/vault/contracts';
import type { AccessPolicyRule } from '../effective-access';
import type {
  CapabilityRequirement,
  ChangeOperation,
  PermissionDiff,
  PermissionPoint,
} from './model';

function stableValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(stableValue);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, stableValue(nested)]),
    );
  }
  return value;
}

function fnv1a(value: string): string {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

export function snapshotFingerprint(value: unknown): string {
  return `v1-${fnv1a(JSON.stringify(stableValue(value)))}`;
}

export function sortChangeOperations(
  operations: readonly ChangeOperation[],
): readonly ChangeOperation[] {
  const byId = new Map<string, ChangeOperation>();
  for (const candidate of operations) {
    if (byId.has(candidate.id)) {
      throw new Error(`Duplicate lifecycle operation ID: ${candidate.id}`);
    }
    byId.set(candidate.id, candidate);
  }
  for (const candidate of operations) {
    for (const dependency of candidate.dependsOn) {
      if (!byId.has(dependency)) {
        throw new Error(`Missing lifecycle operation dependency: ${dependency}`);
      }
    }
  }

  const remaining = new Map(
    operations.map((candidate, index) => [
      candidate.id,
      { candidate, index, dependencies: new Set(candidate.dependsOn) },
    ]),
  );
  const completed = new Set<string>();
  const sorted: ChangeOperation[] = [];

  while (remaining.size > 0) {
    const ready = [...remaining.values()]
      .filter(({ dependencies }) => (
        [...dependencies].every((dependency) => completed.has(dependency))
      ))
      .sort((left, right) => left.index - right.index);
    if (ready.length === 0) throw new Error('Lifecycle operation dependency cycle detected.');
    for (const entry of ready) {
      sorted.push(entry.candidate);
      completed.add(entry.candidate.id);
      remaining.delete(entry.candidate.id);
    }
  }
  return sorted;
}

function points(rules: readonly AccessPolicyRule[]): readonly PermissionPoint[] {
  return rules.flatMap((rule) => rule.capabilities.map((capability) => ({
    pattern: rule.pattern,
    capability,
  })));
}

function pointKey(point: PermissionPoint): string {
  return `${point.pattern}\u0000${point.capability}`;
}

function sortPoints(values: readonly PermissionPoint[]): readonly PermissionPoint[] {
  return [...values].sort((left, right) => (
    left.pattern.localeCompare(right.pattern)
    || left.capability.localeCompare(right.capability)
  ));
}

export function permissionDiff(
  before: readonly AccessPolicyRule[],
  after: readonly AccessPolicyRule[],
): PermissionDiff {
  const beforeByKey = new Map(points(before).map((point) => [pointKey(point), point]));
  const afterByKey = new Map(points(after).map((point) => [pointKey(point), point]));
  return {
    added: sortPoints(
      [...afterByKey].filter(([key]) => !beforeByKey.has(key)).map(([, point]) => point),
    ),
    removed: sortPoints(
      [...beforeByKey].filter(([key]) => !afterByKey.has(key)).map(([, point]) => point),
    ),
  };
}

export interface CapabilityCheck {
  readonly allowed: boolean;
  readonly missing: readonly CapabilityRequirement[];
}

export function capabilityRequirementsSatisfied(
  requirements: readonly CapabilityRequirement[],
  capabilities: VaultCapabilityMap,
): CapabilityCheck {
  const missing = requirements.filter((requirement) => {
    const available = capabilities[requirement.path] ?? [];
    return !available.includes('root')
      && !requirement.anyOf.some((capability) => available.includes(capability));
  });
  return { allowed: missing.length === 0, missing };
}

function destructiveGrant(point: PermissionPoint): boolean {
  return point.capability === 'delete'
    || point.pattern.includes('/destroy/')
    || point.pattern.endsWith('/destroy/*');
}

export function assessPlanRisk(input: {
  readonly resourceId: string;
  readonly operations: readonly ChangeOperation[];
  readonly permissionDiff: PermissionDiff;
}): {
  readonly required: true;
  readonly value: string;
  readonly reasons: readonly string[];
} | undefined {
  const reasons: string[] = [];
  if (input.operations.some((operation) => operation.risk === 'typed-confirmation')) {
    reasons.push('The plan includes a high-risk operation.');
  }
  if (input.permissionDiff.added.some(destructiveGrant)) {
    reasons.push('The plan grants permanent delete or destroy access.');
  }
  return reasons.length > 0
    ? { required: true, value: input.resourceId, reasons }
    : undefined;
}

export function requiredCapabilities(
  operations: readonly ChangeOperation[],
): readonly CapabilityRequirement[] {
  const requirements = new Map<string, Set<VaultCapability>>();
  for (const operation of operations) {
    for (const requirement of operation.requirements) {
      const capabilities = requirements.get(requirement.path) ?? new Set<VaultCapability>();
      requirement.anyOf.forEach((capability) => capabilities.add(capability));
      requirements.set(requirement.path, capabilities);
    }
  }
  return [...requirements.entries()].map(([path, anyOf]) => ({
    path,
    anyOf: [...anyOf],
  }));
}
