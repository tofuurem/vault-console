import type {
  AccessGroup,
  AccessRole,
  EffectiveKvAccessTreeNode,
  ResolvedAccessSelection,
} from '@/domain/access-control/effective-access';
import type { DirectKvAccessRule } from './access';

function flatten(nodes: readonly EffectiveKvAccessTreeNode[]): readonly EffectiveKvAccessTreeNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

interface AccessSummaryProps {
  readonly groups: readonly AccessGroup[];
  readonly roles: readonly AccessRole[];
  readonly selection: ResolvedAccessSelection;
  readonly effectiveTree: readonly EffectiveKvAccessTreeNode[];
  readonly directRules: readonly DirectKvAccessRule[];
}

export default function AccessSummary({
  groups,
  roles,
  selection,
  effectiveTree,
  directRules,
}: AccessSummaryProps) {
  const groupNames = selection.groupIds.map((id) => groups.find((group) => group.id === id)?.name ?? id);
  const inheritedRoleNames = selection.inheritedRoleIds.map((id) => roles.find((role) => role.id === id)?.name ?? id);
  const directRoleNames = selection.directRoleIds.map((id) => roles.find((role) => role.id === id)?.name ?? id);
  const effectiveNodes = flatten(effectiveTree).filter((node) => node.level !== 'none');
  const grants = directRules.filter((rule) => rule.level !== 'deny');
  const denies = directRules.filter((rule) => rule.level === 'deny');
  const owners = effectiveNodes.filter((node) => node.level === 'owner');

  return (
    <aside aria-labelledby="access-summary-heading" className="rounded-lg border border-background-300 bg-background-50 xl:sticky xl:top-4">
      <div className="border-b border-background-200 px-3.5 py-3">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.15em] text-primary-600">Live result</p>
        <h3 id="access-summary-heading" className="mt-0.5 text-xs font-semibold text-foreground-800">Access summary</h3>
      </div>

      <div className="space-y-4 p-3.5 text-[11px]">
        <div className="grid grid-cols-3 gap-1.5 text-center">
          <div className="rounded-md bg-background-100 px-1 py-2">
            <strong className="block font-mono text-sm text-foreground-800">{groupNames.length}</strong>
            <span className="text-[9px] uppercase tracking-wider text-foreground-400">Groups</span>
          </div>
          <div className="rounded-md bg-background-100 px-1 py-2">
            <strong className="block font-mono text-sm text-foreground-800">{effectiveNodes.length}</strong>
            <span className="text-[9px] uppercase tracking-wider text-foreground-400">Paths</span>
          </div>
          <div className={`rounded-md px-1 py-2 ${denies.length ? 'bg-red-50' : 'bg-background-100'}`}>
            <strong className={`block font-mono text-sm ${denies.length ? 'text-red-700' : 'text-foreground-800'}`}>{denies.length}</strong>
            <span className={`text-[9px] uppercase tracking-wider ${denies.length ? 'text-red-500' : 'text-foreground-400'}`}>Denies</span>
          </div>
        </div>

        <div>
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-foreground-400">Groups</p>
          {groupNames.length ? (
            <div className="flex flex-wrap gap-1">{groupNames.map((name) => <span key={name} className="rounded bg-secondary-100 px-1.5 py-0.5 text-secondary-700">{name}</span>)}</div>
          ) : <p className="text-foreground-400">No group membership</p>}
        </div>

        <div>
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-foreground-400">Roles</p>
          {inheritedRoleNames.map((name) => <p key={`inherited-${name}`} className="mb-1 flex items-center gap-1.5 text-foreground-600"><i className="ri-git-merge-line text-emerald-600" aria-hidden="true" />{name}<span className="ml-auto text-[9px] text-foreground-400">via group</span></p>)}
          {directRoleNames.map((name) => <p key={`direct-${name}`} className="mb-1 flex items-center gap-1.5 text-foreground-600"><i className="ri-shield-check-line text-primary-600" aria-hidden="true" />{name}<span className="ml-auto text-[9px] text-primary-500">direct</span></p>)}
          {!inheritedRoleNames.length && !directRoleNames.length && <p className="text-foreground-400">No roles selected</p>}
        </div>

        {(grants.length > 0 || denies.length > 0) && (
          <div className="border-t border-background-200 pt-3">
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-foreground-400">Per-user rules</p>
            {directRules.map((rule) => (
              <p key={rule.nodeId} className="mb-1 flex items-start gap-1.5">
                <span className={`mt-1 h-1.5 w-1.5 shrink-0 rounded-full ${rule.level === 'deny' ? 'bg-red-500' : 'bg-primary-500'}`} />
                <span className="min-w-0 flex-1 truncate font-mono text-[10px] text-foreground-600">{rule.mount}/{rule.path || '*'}</span>
                <span className={rule.level === 'deny' ? 'text-red-600' : 'text-primary-600'}>{rule.level}</span>
              </p>
            ))}
          </div>
        )}

        {selection.unresolvedPolicies.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800">
            <p className="font-semibold">Unresolved external policy</p>
            <p className="mt-0.5 text-[10px]">Effective access may include additional capabilities.</p>
          </div>
        )}
        {selection.ineffectiveDowngrades.length > 0 && (
          <div className="rounded-md border border-amber-200 bg-amber-50 p-2 text-amber-800" role="alert">
            <p className="font-semibold">This rule cannot reduce access</p>
            <p className="mt-0.5 text-[10px]">Vault unions grants on the same policy path. Use Deny or a more-specific path.</p>
          </div>
        )}
        {owners.length > 0 && (
          <div className="rounded-md border border-violet-200 bg-violet-50 p-2 text-violet-800">
            <p className="font-semibold">Owner on {owners.length} path{owners.length === 1 ? '' : 's'}</p>
            <p className="mt-0.5 text-[10px]">Permanent version destruction is allowed.</p>
          </div>
        )}
      </div>
    </aside>
  );
}
