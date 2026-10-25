import type {
  ChangePlan,
  RoleLifecycleSnapshot,
} from '@/domain/access-control/lifecycle/model';
import type { RoleEditorMode } from './role-editor-workflow';

interface RolePolicyDiffProps {
  readonly mode: RoleEditorMode;
  readonly snapshot: RoleLifecycleSnapshot;
  readonly plan: ChangePlan;
}

export default function RolePolicyDiff({
  mode,
  snapshot,
  plan,
}: RolePolicyDiffProps) {
  if (mode === 'create' || !snapshot.policy) return null;
  const [firstOperation] = plan.operations;
  return (
    <details className="rounded-lg border border-background-300 bg-background-50">
      <summary className="cursor-pointer px-4 py-3 text-xs font-semibold text-foreground-700">
        Before / after HCL
      </summary>
      <div className="grid gap-3 border-t border-background-200 p-3 lg:grid-cols-2">
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-background-100 p-3 font-mono text-[10px] text-foreground-600">
          {snapshot.policy.policy}
        </pre>
        <pre className="max-h-72 overflow-auto whitespace-pre-wrap rounded bg-background-100 p-3 font-mono text-[10px] text-foreground-600">
          {firstOperation?.kind === 'write-policy'
            ? firstOperation.policy.policy
            : snapshot.policy.policy}
        </pre>
      </div>
    </details>
  );
}
