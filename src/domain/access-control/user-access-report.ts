import {
  resolveEffectiveKvTree,
  type AccessPolicyRule,
  type EffectiveKvAccessTreeNode,
} from './effective-access';
import {
  classifyPolicyName,
  managedRoleName,
  type ManagedPolicyKind,
} from './managed-resources';
import {
  deriveManagedKvTargets,
  type ManagedKvTargetIssue,
} from './policy-targets';
import type { PolicyRule, PolicySource } from './types';

export interface UserAccessAccount {
  readonly username: string;
  readonly mount: string;
  readonly mountAccessor: string;
}

export interface UserAccessIdentity {
  readonly id: string;
  readonly displayName: string;
  readonly disabled: boolean;
  readonly aliasId?: string;
}

export type UserAccessIdentityState =
  | { readonly status: 'available'; readonly entity: UserAccessIdentity }
  | { readonly status: 'absent' | 'denied' | 'unavailable' };

export type UserAccessGroupsState =
  | { readonly status: 'available' }
  | { readonly status: 'not-applicable' | 'denied' | 'unavailable' };

export type UserAccessPolicyStatus =
  | 'resolved'
  | 'external'
  | 'unreadable'
  | 'missing'
  | 'unsupported'
  | 'denied';

export interface UserAccessPolicy {
  readonly name: string;
  readonly kind: ManagedPolicyKind;
  readonly status: UserAccessPolicyStatus;
  readonly hcl?: string;
  readonly rules?: readonly AccessPolicyRule[];
}

export type UserAccessPolicyOrigin =
  | { readonly kind: 'direct' }
  | {
      readonly kind: 'group';
      readonly groupId: string;
      readonly groupName: string;
    };

export interface UserAccessPolicyAttachment {
  readonly policyName: string;
  readonly origin: UserAccessPolicyOrigin;
}

export interface UserAccessReportInput {
  readonly account: UserAccessAccount;
  readonly mounts: readonly string[];
  readonly identity: UserAccessIdentityState;
  readonly groups: UserAccessGroupsState;
  readonly attachments: readonly UserAccessPolicyAttachment[];
  readonly policies: readonly UserAccessPolicy[];
}

export type UserAccessUnresolvedReason =
  | 'external'
  | 'unreadable'
  | 'missing'
  | 'unsupported'
  | 'denied';

export interface UserAccessReportSource {
  readonly policyName: string;
  readonly policyKind: ManagedPolicyKind;
  readonly origin: UserAccessPolicyOrigin;
  readonly resolution: UserAccessPolicyStatus;
  readonly source: PolicySource;
}

export interface UserAccessUnresolvedSource extends UserAccessReportSource {
  readonly reason: UserAccessUnresolvedReason;
}

export type UserAccessCompletenessState =
  | 'complete'
  | 'partial-visibility'
  | 'limited-by-policy';

export type UserAccessCompletenessReason = {
  readonly source: 'identity' | 'groups' | 'policy' | 'policy-target';
  readonly id: string;
  readonly label: string;
  readonly reason: 'denied' | 'unavailable' | UserAccessUnresolvedReason;
};

export interface UserAccessReportTarget extends EffectiveKvAccessTreeNode {
  readonly patterns: readonly string[];
}

export interface UserAccessPolicyTargetIssue extends ManagedKvTargetIssue {
  readonly policyName: string;
}

export interface UserAccessReport {
  readonly account: UserAccessAccount;
  readonly identity?: UserAccessIdentity;
  readonly groups: readonly {
    readonly id: string;
    readonly name: string;
  }[];
  readonly sources: readonly UserAccessReportSource[];
  readonly unresolvedSources: readonly UserAccessUnresolvedSource[];
  readonly policyTargetIssues: readonly UserAccessPolicyTargetIssue[];
  readonly rules: readonly PolicyRule[];
  readonly targets: readonly UserAccessReportTarget[];
  readonly completeness: {
    readonly state: UserAccessCompletenessState;
    readonly reasons: readonly UserAccessCompletenessReason[];
  };
}

function attachmentKey(attachment: UserAccessPolicyAttachment): string {
  const origin = attachment.origin.kind === 'direct'
    ? '0'
    : `1:${attachment.origin.groupName}:${attachment.origin.groupId}`;
  return `${attachment.policyName}\u001f${origin}`;
}

function sortedAttachments(
  attachments: readonly UserAccessPolicyAttachment[],
): readonly UserAccessPolicyAttachment[] {
  const unique = new Map(
    attachments.map((attachment) => [attachmentKey(attachment), attachment]),
  );
  return [...unique.values()].sort((left, right) => (
    left.policyName.localeCompare(right.policyName)
    || attachmentKey(left).localeCompare(attachmentKey(right))
  ));
}

function sourceFor(
  attachment: UserAccessPolicyAttachment,
  policyKind: ManagedPolicyKind,
): PolicySource {
  if (attachment.origin.kind === 'group') {
    return {
      kind: 'group',
      id: attachment.origin.groupId,
      label: attachment.origin.groupName,
      via: policyKind === 'role'
        ? managedRoleName(attachment.policyName)
        : attachment.policyName,
    };
  }
  if (policyKind === 'role') {
    return {
      kind: 'role',
      id: attachment.policyName,
      label: managedRoleName(attachment.policyName),
    };
  }
  if (policyKind === 'user-direct') {
    return {
      kind: 'user-rule',
      id: attachment.policyName,
      label: attachment.policyName,
    };
  }
  return {
    kind: 'external-policy',
    id: attachment.policyName,
    label: attachment.policyName,
  };
}

function policyStatus(
  policy: UserAccessPolicy | undefined,
): UserAccessPolicyStatus {
  if (!policy) return 'missing';
  if (policy.kind === 'external') return 'external';
  if (policy.status !== 'resolved') return policy.status;
  return policy.rules && policy.rules.length > 0 ? 'resolved' : 'unsupported';
}

function reasonForStatus(
  status: UserAccessPolicyStatus,
): UserAccessUnresolvedReason | undefined {
  return status === 'resolved' ? undefined : status;
}

function reportSource(
  attachment: UserAccessPolicyAttachment,
  policy: UserAccessPolicy | undefined,
): UserAccessReportSource {
  const policyKind = policy?.kind ?? classifyPolicyName(attachment.policyName);
  return {
    policyName: attachment.policyName,
    policyKind,
    origin: attachment.origin,
    resolution: policyStatus(policy),
    source: sourceFor(attachment, policyKind),
  };
}

function completenessReasonKey(reason: UserAccessCompletenessReason): string {
  return `${reason.source}\u001f${reason.id}\u001f${reason.reason}`;
}

function sortedCompletenessReasons(
  reasons: readonly UserAccessCompletenessReason[],
): readonly UserAccessCompletenessReason[] {
  const unique = new Map(
    reasons.map((reason) => [completenessReasonKey(reason), reason]),
  );
  return [...unique.values()].sort((left, right) => (
    left.source.localeCompare(right.source)
    || left.id.localeCompare(right.id)
    || left.reason.localeCompare(right.reason)
  ));
}

function groupSummaries(
  attachments: readonly UserAccessPolicyAttachment[],
): UserAccessReport['groups'] {
  const groups = new Map<string, { id: string; name: string }>();
  for (const attachment of attachments) {
    if (attachment.origin.kind !== 'group') continue;
    groups.set(attachment.origin.groupId, {
      id: attachment.origin.groupId,
      name: attachment.origin.groupName,
    });
  }
  return [...groups.values()].sort((left, right) => (
    left.name.localeCompare(right.name) || left.id.localeCompare(right.id)
  ));
}

function targetIssueMakesReportPartial(issue: ManagedKvTargetIssue): boolean {
  return issue.reason === 'unsafe-pattern'
    || issue.reason === 'unsupported-wildcard'
    || issue.reason === 'ambiguous-target';
}

function completenessState(
  reasons: readonly UserAccessCompletenessReason[],
): UserAccessCompletenessState {
  if (reasons.some((reason) => reason.reason === 'denied')) {
    return 'limited-by-policy';
  }
  return reasons.length > 0 ? 'partial-visibility' : 'complete';
}

export function buildUserAccessReport(
  input: UserAccessReportInput,
): UserAccessReport {
  const policiesByName = new Map(
    [...input.policies]
      .sort((left, right) => left.name.localeCompare(right.name))
      .map((policy) => [policy.name, policy]),
  );
  const attachments = sortedAttachments(input.attachments);
  const sources = attachments.map((attachment) => (
    reportSource(attachment, policiesByName.get(attachment.policyName))
  ));
  const unresolvedSources: UserAccessUnresolvedSource[] = [];
  const endpointRules: PolicyRule[] = [];
  const targetsById = new Map<string, {
    readonly mount: string;
    readonly path: string;
    readonly target: UserAccessReportTarget['target'];
    readonly patterns: Set<string>;
  }>();
  const policyTargetIssues: UserAccessPolicyTargetIssue[] = [];
  const completenessReasons: UserAccessCompletenessReason[] = [];

  if (input.identity.status === 'denied' || input.identity.status === 'unavailable') {
    completenessReasons.push({
      source: 'identity',
      id: 'identity',
      label: 'Identity entity',
      reason: input.identity.status,
    });
  }
  if (input.groups.status === 'denied' || input.groups.status === 'unavailable') {
    completenessReasons.push({
      source: 'groups',
      id: 'groups',
      label: 'Identity groups',
      reason: input.groups.status,
    });
  }

  sources.forEach((sourceRecord) => {
    const policy = policiesByName.get(sourceRecord.policyName);
    const unresolvedReason = reasonForStatus(sourceRecord.resolution);
    if (unresolvedReason) {
      unresolvedSources.push({ ...sourceRecord, reason: unresolvedReason });
      completenessReasons.push({
        source: 'policy',
        id: sourceRecord.policyName,
        label: sourceRecord.policyName,
        reason: unresolvedReason,
      });
      return;
    }

    const rules = policy?.rules ?? [];
    const derivation = deriveManagedKvTargets(input.mounts, rules);
    endpointRules.push(
      ...rules.map((rule) => ({
        ...rule,
        source: sourceRecord.source,
      })),
    );
    derivation.targets.forEach((target) => {
      const existing = targetsById.get(target.id);
      const patterns = new Set(existing?.patterns ?? []);
      target.patterns.forEach((pattern) => patterns.add(pattern));
      targetsById.set(target.id, {
        mount: target.mount,
        path: target.path,
        target: target.target,
        patterns,
      });
    });
    derivation.issues.forEach((issue) => {
      policyTargetIssues.push({
        ...issue,
        policyName: sourceRecord.policyName,
      });
      if (targetIssueMakesReportPartial(issue)) {
        completenessReasons.push({
          source: 'policy-target',
          id: sourceRecord.policyName,
          label: sourceRecord.policyName,
          reason: 'unsupported',
        });
      }
    });
  });

  const targetInputs = [...targetsById.entries()]
    .map(([id, target]) => ({
      id,
      label: target.path.split('/').filter(Boolean).at(-1) ?? `${target.mount}/`,
      mount: target.mount,
      path: target.path,
      target: target.target,
      children: [],
    }))
    .sort((left, right) => (
      left.mount.localeCompare(right.mount)
      || left.path.localeCompare(right.path)
      || left.target.localeCompare(right.target)
    ));
  const resolvedTargets = resolveEffectiveKvTree(targetInputs, endpointRules);
  const targets = resolvedTargets.map((target): UserAccessReportTarget => ({
    ...target,
    patterns: [...(targetsById.get(target.id)?.patterns ?? [])]
      .sort((left, right) => left.localeCompare(right)),
  }));
  const reasons = sortedCompletenessReasons(completenessReasons);

  return {
    account: input.account,
    ...(input.identity.status === 'available'
      ? { identity: input.identity.entity }
      : {}),
    groups: groupSummaries(attachments),
    sources,
    unresolvedSources: unresolvedSources.sort((left, right) => (
      left.policyName.localeCompare(right.policyName)
      || attachmentKey(left).localeCompare(attachmentKey(right))
    )),
    policyTargetIssues: policyTargetIssues.sort((left, right) => (
      left.policyName.localeCompare(right.policyName)
      || left.pattern.localeCompare(right.pattern)
      || left.reason.localeCompare(right.reason)
    )),
    rules: endpointRules,
    targets,
    completeness: {
      state: completenessState(reasons),
      reasons,
    },
  };
}
