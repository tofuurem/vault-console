import type { AccessPolicyRule } from './effective-access';
import type { KvAccessTarget } from './kv-v2-policy-compiler';
import { normalizeVaultPath } from './policy-matcher';

const KV_ENDPOINTS = new Set([
  'data',
  'metadata',
  'delete',
  'undelete',
  'destroy',
]);

export type ManagedKvTargetIssueReason =
  | 'outside-kv-mount'
  | 'unsupported-endpoint'
  | 'unsupported-wildcard'
  | 'unsafe-pattern'
  | 'ambiguous-target';

export interface ManagedKvTargetIssue {
  readonly pattern: string;
  readonly reason: ManagedKvTargetIssueReason;
}

export interface ManagedKvTarget {
  readonly id: string;
  readonly mount: string;
  readonly path: string;
  readonly target: KvAccessTarget;
  readonly patterns: readonly string[];
}

export interface ManagedKvTargetDerivation {
  readonly targets: readonly ManagedKvTarget[];
  readonly ignoredTraversalPatterns: readonly string[];
  readonly issues: readonly ManagedKvTargetIssue[];
}

interface Candidate {
  readonly mount: string;
  readonly path: string;
  readonly target: KvAccessTarget;
  readonly endpoint: string;
  readonly pattern: string;
  readonly metadataRootDeny: boolean;
  readonly onlyDeny: boolean;
}

function normalizeMount(mount: string): string {
  return normalizeVaultPath(mount).replace(/\/+$/, '');
}

function knownMounts(mounts: readonly string[]): readonly string[] {
  return [...new Set(mounts.map(normalizeMount).filter(Boolean))]
    .sort((left, right) => right.length - left.length || left.localeCompare(right));
}

function matchedMount(pattern: string, mounts: readonly string[]): string | undefined {
  return mounts.find((mount) => pattern.startsWith(`${mount}/`));
}

function unsafeSegments(segments: readonly string[]): boolean {
  return segments.some(
    (segment) => segment.length === 0 || segment === '.' || segment === '..',
  );
}

function hasUnsupportedWildcard(segments: readonly string[]): boolean {
  return segments.some((segment, index) => (
    segment === '+'
    || (segment.includes('*') && !(segment === '*' && index === segments.length - 1))
  ));
}

function onlyCapability(
  rule: AccessPolicyRule,
  capability: AccessPolicyRule['capabilities'][number],
): boolean {
  return rule.capabilities.length > 0
    && rule.capabilities.every((candidate) => candidate === capability);
}

function targetKey(
  target: Pick<Candidate, 'mount' | 'path' | 'target'>,
): string {
  return `${target.mount}:${target.target}:${target.path}`;
}

function logicalKey(target: Pick<Candidate, 'mount' | 'path'>): string {
  return `${target.mount}:${target.path}`;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort((left, right) => left.localeCompare(right));
}

function groupBy<T>(
  values: readonly T[],
  keyFor: (value: T) => string,
): ReadonlyMap<string, readonly T[]> {
  const grouped = new Map<string, T[]>();
  for (const value of values) {
    const key = keyFor(value);
    grouped.set(key, [...(grouped.get(key) ?? []), value]);
  }
  return grouped;
}

function uniqueIssues(
  issues: readonly ManagedKvTargetIssue[],
): readonly ManagedKvTargetIssue[] {
  const byKey = new Map(
    issues.map((issue) => [`${issue.pattern}\u001f${issue.reason}`, issue]),
  );
  return [...byKey.values()].sort((left, right) => (
    left.pattern.localeCompare(right.pattern)
    || left.reason.localeCompare(right.reason)
  ));
}

export function deriveManagedKvTargets(
  mounts: readonly string[],
  rules: readonly AccessPolicyRule[],
): ManagedKvTargetDerivation {
  const normalizedMounts = knownMounts(mounts);
  const candidates: Candidate[] = [];
  const ignoredTraversalPatterns: string[] = [];
  const issues: ManagedKvTargetIssue[] = [];

  for (const rule of rules) {
    const pattern = normalizeVaultPath(rule.pattern);
    const segments = pattern.split('/');
    if (!pattern || unsafeSegments(segments)) {
      issues.push({ pattern, reason: 'unsafe-pattern' });
      continue;
    }

    const mount = matchedMount(pattern, normalizedMounts);
    if (!mount) {
      issues.push({ pattern, reason: 'outside-kv-mount' });
      continue;
    }

    const remainder = pattern.slice(mount.length + 1).split('/');
    const [endpoint, ...logicalSegments] = remainder;
    if (!KV_ENDPOINTS.has(endpoint)) {
      issues.push({ pattern, reason: 'unsupported-endpoint' });
      continue;
    }
    if (unsafeSegments(logicalSegments)) {
      issues.push({ pattern, reason: 'unsafe-pattern' });
      continue;
    }
    if (hasUnsupportedWildcard(logicalSegments)) {
      issues.push({ pattern, reason: 'unsupported-wildcard' });
      continue;
    }

    if (
      endpoint === 'metadata'
      && onlyCapability(rule, 'list')
      && logicalSegments.at(-1) !== '*'
    ) {
      ignoredTraversalPatterns.push(pattern);
      continue;
    }

    if (logicalSegments.length === 0) {
      const metadataRootDeny = endpoint === 'metadata' && onlyCapability(rule, 'deny');
      if (!metadataRootDeny) {
        issues.push({ pattern, reason: 'ambiguous-target' });
        continue;
      }
      candidates.push({
        mount,
        path: '',
        target: 'secret',
        endpoint,
        pattern,
        metadataRootDeny,
        onlyDeny: true,
      });
      continue;
    }

    const recursive = logicalSegments.at(-1) === '*';
    const path = (recursive ? logicalSegments.slice(0, -1) : logicalSegments).join('/');
    candidates.push({
      mount,
      path,
      target: recursive ? 'folder' : 'secret',
      endpoint,
      pattern,
      metadataRootDeny: false,
      onlyDeny: onlyCapability(rule, 'deny'),
    });
  }

  const folderLogicalKeys = new Set(
    candidates
      .filter((candidate) => candidate.target === 'folder')
      .map(logicalKey),
  );
  const exactByLogicalKey = groupBy<Candidate>(
    candidates.filter((candidate) => candidate.target === 'secret'),
    logicalKey,
  );
  const suppressed = new Set<Candidate>();

  for (const [key, exactCandidates] of exactByLogicalKey) {
    const metadataOnlyDeny = exactCandidates.every(
      (candidate) => candidate.endpoint === 'metadata' && candidate.onlyDeny,
    );
    if (folderLogicalKeys.has(key) && metadataOnlyDeny) {
      exactCandidates.forEach((candidate) => suppressed.add(candidate));
      continue;
    }
    for (const candidate of exactCandidates) {
      if (candidate.metadataRootDeny) {
        suppressed.add(candidate);
        issues.push({ pattern: candidate.pattern, reason: 'ambiguous-target' });
      }
    }
  }

  const grouped = groupBy<Candidate>(
    candidates.filter((candidate) => !suppressed.has(candidate)),
    targetKey,
  );
  const targets = [...grouped.values()]
    .map((targetCandidates): ManagedKvTarget => {
      const first = targetCandidates[0];
      return {
        id: targetKey(first),
        mount: first.mount,
        path: first.path,
        target: first.target,
        patterns: uniqueSorted(targetCandidates.map(({ pattern }) => pattern)),
      };
    })
    .sort((left, right) => (
      left.mount.localeCompare(right.mount)
      || left.path.localeCompare(right.path)
      || left.target.localeCompare(right.target)
    ));

  return {
    targets,
    ignoredTraversalPatterns: uniqueSorted(ignoredTraversalPatterns),
    issues: uniqueIssues(issues),
  };
}
