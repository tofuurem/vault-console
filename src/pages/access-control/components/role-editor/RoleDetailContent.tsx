import type { LogicalKvAccessRule } from '@/domain/access-control/kv-v2-policy-compiler';
import type {
  RoleDependency,
  RoleLifecycleSnapshot,
} from '@/domain/access-control/lifecycle/model';
import { parseManagedPolicyHcl } from '@/domain/access-control/managed-resources';
import { parseManagedPolicyHeader } from '@/domain/access-control/policy-ownership';
import type { VaultAclPolicy } from '@/domain/vault/contracts';
import {
  DeleteBlockedNotice,
  DetailEmptyRow,
  DetailMetrics,
  DetailNote,
  DetailPanel,
} from '../workspace/DetailSections';

interface RoleDetailContentProps {
  readonly snapshot: RoleLifecycleSnapshot;
  readonly policy: VaultAclPolicy;
  readonly visualRules: readonly LogicalKvAccessRule[] | null;
  readonly deleteReason?: string;
}

function VisualTargetsPanel({
  visualRules,
}: {
  readonly visualRules: readonly LogicalKvAccessRule[] | null;
}) {
  return (
    <DetailPanel title="Visual KV targets" bodyClassName="divide-y divide-background-100">
      {visualRules?.map((rule) => (
        <div key={`${rule.mount}:${rule.path}:${rule.target}`} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
          <span>
            <span className="block font-mono text-xs text-foreground-800">
              {rule.mount}/{rule.path || '*'}
            </span>
            <span className="text-[10px] uppercase text-foreground-400">{rule.target}</span>
          </span>
          <span className="rounded bg-primary-100 px-2 py-1 text-[10px] font-semibold text-primary-700">
            {rule.level}
          </span>
        </div>
      ))}
      {visualRules?.length === 0 && <DetailEmptyRow>No KV targets.</DetailEmptyRow>}
    </DetailPanel>
  );
}

function ReferencesPanel({
  dependencies,
}: {
  readonly dependencies: readonly RoleDependency[];
}) {
  return (
    <DetailPanel title="References" bodyClassName="divide-y divide-background-100">
      {dependencies.map((dependency) => (
        <div key={`${dependency.kind}:${dependency.id}`} className="px-4 py-3">
          <p className="text-xs font-semibold text-foreground-800">{dependency.name}</p>
          <p className="font-mono text-[10px] text-foreground-400">
            {dependency.kind} · {dependency.id}
          </p>
        </div>
      ))}
      {dependencies.length === 0 && <DetailEmptyRow>No references.</DetailEmptyRow>}
    </DetailPanel>
  );
}

export default function RoleDetailContent({
  snapshot,
  policy,
  visualRules,
  deleteReason,
}: RoleDetailContentProps) {
  const header = parseManagedPolicyHeader(policy.policy);
  const parsedRules = parseManagedPolicyHcl(policy.policy);
  return (
    <div className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-5">
      <div className="mx-auto max-w-[1280px] space-y-5">
        {visualRules === null && (
          <div role="alert" className="rounded-md border border-warning-300 bg-warning-50 px-3 py-2 text-[10px] leading-4 text-warning-900">
            The visual editor cannot show these rules without changing them. The policy stays
            readable below, but Adopt and Edit are disabled.
          </div>
        )}
        {deleteReason && snapshot.ownership === 'managed' && (
          <DeleteBlockedNotice reason={deleteReason} />
        )}
        <DetailMetrics
          valueSizeClassName="text-sm"
          metrics={[
            ['KV targets', visualRules?.length ?? '—'],
            ['HCL path blocks', parsedRules?.length ?? '—'],
            ['Dependencies', snapshot.dependencies.length],
            ['Effect timing', 'Next request'],
          ]}
        />

        <DetailNote label="Managed description">
          {header?.kind === 'role'
            ? header.description || 'No description.'
            : 'Not marked as managed by Vault Console.'}
        </DetailNote>

        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
          <VisualTargetsPanel visualRules={visualRules} />
          <ReferencesPanel dependencies={snapshot.dependencies} />
        </div>

        <details className="rounded-lg border border-background-300 bg-background-50">
          <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-foreground-700">
            Raw HCL
          </summary>
          <pre className="max-h-[440px] overflow-auto whitespace-pre-wrap border-t border-background-200 p-4 font-mono text-[10px] text-foreground-600">
            {policy.policy}
          </pre>
        </details>
      </div>
    </div>
  );
}
