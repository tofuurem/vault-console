import {
  VAULT_CAPABILITIES,
  type PolicyRule,
  type PolicySource,
  type ResolvedPolicyAccess,
  type VaultCapability,
} from './types';

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeVaultPath(path: string): string {
  return path.replace(/^\/+/, '');
}

function patternExpression(pattern: string): RegExp {
  const segments = normalizeVaultPath(pattern).split('/');
  const expression = segments
    .map((segment, index) => {
      if (segment === '+') return '[^/]+';

      const isLast = index === segments.length - 1;
      if (isLast && segment.endsWith('*')) {
        return `${escapeRegExp(segment.slice(0, -1))}.*`;
      }

      return escapeRegExp(segment);
    })
    .join('/');

  return new RegExp(`^${expression}$`);
}

export function matchesPolicyPattern(pattern: string, requestPath: string): boolean {
  return patternExpression(pattern).test(normalizeVaultPath(requestPath));
}

function firstWildcardIndex(pattern: string): number {
  const globIndex = pattern.indexOf('*');
  const segmentWildcardIndex = pattern
    .split('/')
    .reduce((offsets, segment, index, segments) => {
      if (segment !== '+') return offsets;
      const prefixLength = segments.slice(0, index).reduce((total, value) => total + value.length + 1, 0);
      return [...offsets, prefixLength];
    }, [] as number[])
    .at(0);

  if (globIndex === -1) return segmentWildcardIndex ?? Number.POSITIVE_INFINITY;
  if (segmentWildcardIndex === undefined) return globIndex;
  return Math.min(globIndex, segmentWildcardIndex);
}

function segmentWildcardCount(pattern: string): number {
  return pattern.split('/').filter((segment) => segment === '+').length;
}

/**
 * Compares Vault policy patterns by the priority rules used for ACL matching.
 * A positive value means `left` has higher priority than `right`.
 */
export function comparePolicyPatterns(leftPattern: string, rightPattern: string): number {
  const left = normalizeVaultPath(leftPattern);
  const right = normalizeVaultPath(rightPattern);

  if (left === right) return 0;

  const wildcardDifference = firstWildcardIndex(left) - firstWildcardIndex(right);
  if (wildcardDifference !== 0) return wildcardDifference;

  const leftEndsInGlob = left.endsWith('*');
  const rightEndsInGlob = right.endsWith('*');
  if (leftEndsInGlob !== rightEndsInGlob) return leftEndsInGlob ? -1 : 1;

  const plusDifference = segmentWildcardCount(right) - segmentWildcardCount(left);
  if (plusDifference !== 0) return plusDifference;

  const lengthDifference = left.length - right.length;
  if (lengthDifference !== 0) return lengthDifference;

  return left > right ? 1 : -1;
}

function sourceKey(source: PolicySource): string {
  return `${source.kind}:${source.id}:${source.via ?? ''}`;
}

function uniqueSources(sources: readonly PolicySource[]): readonly PolicySource[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = sourceKey(source);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function resolvePolicyAccess(requestPath: string, rules: readonly PolicyRule[]): ResolvedPolicyAccess {
  const normalizedRequestPath = normalizeVaultPath(requestPath);
  const matchingRules = rules.filter((rule) => matchesPolicyPattern(rule.pattern, normalizedRequestPath));

  if (matchingRules.length === 0) {
    return {
      requestPath: normalizedRequestPath,
      matchedPattern: null,
      capabilities: [],
      denied: false,
      sources: [],
      capabilitySources: {},
    };
  }

  const selectedPattern = matchingRules.reduce((highest, rule) =>
    comparePolicyPatterns(rule.pattern, highest) > 0 ? normalizeVaultPath(rule.pattern) : highest,
  normalizeVaultPath(matchingRules[0].pattern));
  const selectedRules = matchingRules.filter(
    (rule) => normalizeVaultPath(rule.pattern) === selectedPattern,
  );
  const allCapabilities = new Set(selectedRules.flatMap((rule) => rule.capabilities));
  const denied = allCapabilities.has('deny');
  const capabilities = denied
    ? (['deny'] as const)
    : VAULT_CAPABILITIES.filter((capability) => capability !== 'deny' && allCapabilities.has(capability));
  const capabilitySources = Object.fromEntries(
    capabilities.map((capability) => [
      capability,
      uniqueSources(
        selectedRules
          .filter((rule) => rule.capabilities.includes(capability))
          .map((rule) => rule.source),
      ),
    ]),
  ) as Partial<Record<VaultCapability, readonly PolicySource[]>>;

  return {
    requestPath: normalizedRequestPath,
    matchedPattern: selectedPattern,
    capabilities,
    denied,
    sources: uniqueSources(selectedRules.map((rule) => rule.source)),
    capabilitySources,
  };
}
