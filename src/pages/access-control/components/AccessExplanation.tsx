import type {
  EffectiveKvAccessTreeNode,
  EffectiveKvEndpointAccess,
  EffectiveKvPermissionLevel,
} from '@/domain/access-control/effective-access';
import type {
  PolicySource,
  ResolvedPolicyAccess,
} from '@/domain/access-control/types';

export interface ExplainableAccessTarget extends EffectiveKvAccessTreeNode {
  readonly patterns?: readonly string[];
}

interface AccessExplanationProps {
  readonly target: ExplainableAccessTarget;
  readonly compact?: boolean;
}

const ENDPOINTS: readonly {
  readonly key: keyof EffectiveKvEndpointAccess;
  readonly label: string;
  readonly description: string;
}[] = [
  { key: 'data', label: 'Data', description: 'Read and write secret values' },
  { key: 'metadata', label: 'Metadata', description: 'Read metadata or delete the key' },
  { key: 'metadataList', label: 'List', description: 'Discover folders and secret names' },
  { key: 'deleteVersions', label: 'Delete versions', description: 'Soft-delete selected versions' },
  { key: 'undeleteVersions', label: 'Undelete', description: 'Restore soft-deleted versions' },
  { key: 'destroyVersions', label: 'Destroy', description: 'Permanently destroy versions' },
] as const;

const LEVEL_LABELS: Record<EffectiveKvPermissionLevel, string> = {
  none: 'None',
  view: 'View',
  edit: 'Edit',
  'manage-versions': 'Manage versions',
  owner: 'Owner',
  deny: 'Deny',
  custom: 'Custom',
};

function sourceLabel(source: PolicySource): string {
  if (source.kind === 'group' && source.via) {
    return `${source.label} → ${source.via}`;
  }
  return source.label;
}

function uniqueSourceLabels(sources: readonly PolicySource[]): readonly string[] {
  return [...new Set(sources.map(sourceLabel))];
}

function capabilitySourceLabel(
  access: ResolvedPolicyAccess,
  capability: ResolvedPolicyAccess['capabilities'][number],
): string {
  const labels = uniqueSourceLabels(access.capabilitySources[capability] ?? []);
  return labels.length > 0 ? labels.join(', ') : 'resolved policy';
}

function EndpointCard({
  access,
  label,
  description,
}: {
  readonly access: ResolvedPolicyAccess;
  readonly label: string;
  readonly description: string;
}) {
  const sources = uniqueSourceLabels(access.sources);
  return (
    <article className="min-w-[230px] rounded-md border border-background-200 bg-background-50 p-2.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h4 className="text-[11px] font-semibold text-foreground-800">{label}</h4>
          <p className="mt-0.5 text-[9px] leading-3.5 text-foreground-400">{description}</p>
        </div>
        {access.denied && (
          <span className="rounded-full bg-danger-100 px-1.5 py-0.5 text-[9px] font-semibold text-danger-800">
            Denied
          </span>
        )}
      </div>
      <p className="mt-2 truncate font-mono text-[9px] text-foreground-500" title={access.requestPath}>
        {access.requestPath}
      </p>
      <div className="mt-2 flex min-h-5 flex-wrap gap-1">
        {access.capabilities.length > 0 ? access.capabilities.map((capability) => (
          <span
            key={capability}
            aria-label={`${capability} from ${capabilitySourceLabel(access, capability)}`}
            title={`${capability} — ${capabilitySourceLabel(access, capability)}`}
            className={`rounded px-1.5 py-0.5 font-mono text-[9px] font-semibold ${
              capability === 'deny'
                ? 'bg-danger-100 text-danger-800'
                : 'bg-primary-100 text-primary-800'
            }`}
          >
            {capability}
          </span>
        )) : (
          <span className="text-[10px] text-foreground-400">No capabilities</span>
        )}
      </div>
      <dl className="mt-2 space-y-1 border-t border-background-200 pt-2 text-[9px]">
        <div className="grid grid-cols-[52px_1fr] gap-2">
          <dt className="text-foreground-400">Pattern</dt>
          <dd className="truncate font-mono text-foreground-600" title={access.matchedPattern ?? 'No matched rule'}>
            {access.matchedPattern ?? 'No matched rule'}
          </dd>
        </div>
        <div className="grid grid-cols-[52px_1fr] gap-2">
          <dt className="text-foreground-400">Sources</dt>
          <dd className="truncate text-foreground-600" title={sources.join(', ') || 'None'}>
            {sources.join(', ') || 'None'}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export default function AccessExplanation({
  target,
  compact = false,
}: AccessExplanationProps) {
  const fullPath = `${target.mount}/${target.path}${target.target === 'folder' && target.path ? '/' : ''}`;
  return (
    <section
      aria-labelledby={`access-explanation-${target.id}`}
      className={`border-background-200 bg-background-100/70 ${compact
        ? 'border-t px-3 py-3'
        : 'rounded-lg border p-3'
      }`}
    >
      <header className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-primary-600">
            Why this result
          </p>
          <h3
            id={`access-explanation-${target.id}`}
            className="mt-0.5 truncate font-mono text-xs font-semibold text-foreground-900"
            title={fullPath}
          >
            {fullPath}
          </h3>
        </div>
        <span className={`rounded-full px-2 py-1 text-[9px] font-semibold ${
          target.level === 'deny'
            ? 'bg-danger-100 text-danger-800'
            : target.level === 'none'
              ? 'bg-background-200 text-foreground-600'
              : 'bg-primary-100 text-primary-800'
        }`}>
          {LEVEL_LABELS[target.level]}
        </span>
      </header>

      {target.patterns && target.patterns.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1">
          {target.patterns.map((pattern) => (
            <code
              key={pattern}
              className="max-w-full truncate rounded bg-background-200 px-1.5 py-0.5 font-mono text-[9px] text-foreground-600"
              title={pattern}
            >
              {pattern}
            </code>
          ))}
        </div>
      )}

      <div
        className="mt-3 grid gap-2 overflow-x-auto pb-1 sm:grid-cols-2 xl:grid-cols-3"
        aria-label="Resolved KV endpoint capabilities"
      >
        {ENDPOINTS.map((endpoint) => (
          <EndpointCard
            key={endpoint.key}
            access={target.endpointAccess[endpoint.key]}
            label={endpoint.label}
            description={endpoint.description}
          />
        ))}
      </div>
    </section>
  );
}
