import { useState } from 'react';

import type {
  EffectiveKvAccessTreeNode,
  EffectiveKvPermissionLevel,
  KvAccessTreeNode,
} from '@/domain/access-control/effective-access';
import type { KvPermissionLevel } from '@/domain/access-control/permission-presets';
import type { DirectKvAccessRule } from './access';
import DirectAccessEditor from './DirectAccessEditor';

const LEVEL_LABELS: Readonly<Record<EffectiveKvPermissionLevel, string>> = {
  none: 'No access',
  view: 'View',
  edit: 'Edit',
  'manage-versions': 'Manage versions',
  owner: 'Owner',
  deny: 'Denied',
  custom: 'Custom',
};

const LEVEL_STYLES: Readonly<Record<EffectiveKvPermissionLevel, string>> = {
  none: 'border-background-300 bg-background-100 text-foreground-500',
  view: 'border-sky-200 bg-sky-50 text-sky-700',
  edit: 'border-amber-200 bg-amber-50 text-amber-700',
  'manage-versions': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  owner: 'border-violet-200 bg-violet-50 text-violet-700',
  deny: 'border-red-200 bg-red-50 text-red-700',
  custom: 'border-background-400 bg-background-100 text-foreground-700',
};

function logicalPath(node: KvAccessTreeNode): string {
  return node.path ? `${node.mount}/${node.path}` : `${node.mount}/`;
}

function initialExpanded(nodes: readonly EffectiveKvAccessTreeNode[]): Set<string> {
  return new Set(nodes.flatMap((node) => [node.id, ...(node.children ?? []).map((child) => child.id)]));
}

interface EffectivePermissionTreeProps {
  readonly nodes: readonly EffectiveKvAccessTreeNode[];
  readonly directRules: readonly DirectKvAccessRule[];
  readonly onDirectRuleChange: (node: KvAccessTreeNode, level: KvPermissionLevel) => void;
  readonly readOnly?: boolean;
}

export default function EffectivePermissionTree({
  nodes,
  directRules,
  onDirectRuleChange,
  readOnly = false,
}: EffectivePermissionTreeProps) {
  const [expanded, setExpanded] = useState(() => initialExpanded(nodes));
  const toggle = (nodeId: string) => {
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(nodeId)) next.delete(nodeId);
      else next.add(nodeId);
      return next;
    });
  };

  const renderNode = (node: EffectiveKvAccessTreeNode, depth: number) => {
    const hasChildren = node.children.length > 0;
    const isExpanded = expanded.has(node.id);
    const direct = directRules.find((rule) => rule.nodeId === node.id);
    const path = logicalPath(node);
    const provenance = node.sources
      .slice(0, 2)
      .map((source) => source.kind === 'group' && source.via ? `${source.label} → ${source.via}` : source.label)
      .join(', ');

    return (
      <div key={node.id}>
        <div
          data-testid={`permission-node-${node.id}`}
          className="group flex min-h-10 items-center gap-2 border-b border-background-200 px-2.5 py-1.5 hover:bg-background-100/70"
          style={{ paddingLeft: `${10 + depth * 16}px` }}
        >
          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggle(node.id)}
              aria-label={`${isExpanded ? 'Collapse' : 'Expand'} ${path}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-foreground-400 hover:bg-background-200 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              <i className={isExpanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} aria-hidden="true" />
            </button>
          ) : (
            <span className="w-6 shrink-0" />
          )}
          <i className={`${node.target === 'folder' ? 'ri-folder-3-line text-amber-500' : 'ri-key-2-line text-foreground-400'} shrink-0 text-sm`} aria-hidden="true" />

          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-2">
              <span className="truncate font-mono text-xs font-medium text-foreground-800">{node.label}</span>
              {direct && (
                <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${direct.level === 'deny' ? 'bg-red-100 text-red-700' : 'bg-primary-100 text-primary-700'}`}>
                  {direct.level === 'deny' ? 'Direct deny' : 'Direct'}
                </span>
              )}
            </div>
            <p className="mt-0.5 truncate text-[10px] text-foreground-400" title={provenance || 'Vault default deny'}>
              {provenance || 'No matching group or role'}
            </p>
          </div>

          <span
            data-testid={`effective-level-${node.id}`}
            className={`hidden min-w-[92px] justify-center rounded border px-1.5 py-1 text-[10px] font-semibold sm:inline-flex ${LEVEL_STYLES[node.level]}`}
            title="Effective access after Vault path resolution"
          >
            {LEVEL_LABELS[node.level]}
          </span>
          {!readOnly && (
            <DirectAccessEditor
              label={path}
              value={direct?.level ?? 'inherited'}
              onChange={(level) => onDirectRuleChange(node, level)}
            />
          )}
        </div>
        {hasChildren && isExpanded && node.children.map((child) => renderNode(child, depth + 1))}
      </div>
    );
  };

  return (
    <section aria-labelledby="permission-tree-heading" className="overflow-hidden rounded-lg border border-background-300 bg-background-50">
      <div className="flex items-start justify-between gap-3 border-b border-background-200 px-3.5 py-3">
        <div>
          <h3 id="permission-tree-heading" className="text-xs font-semibold text-foreground-800">Effective KV access</h3>
          <p className="mt-0.5 text-[11px] leading-4 text-foreground-400">
            {readOnly
              ? 'Each badge shows the final Vault result after group, role, and direct-policy resolution.'
              : 'The middle badge is the Vault result. The selector adds a per-user exception.'}
          </p>
        </div>
        <div className="hidden shrink-0 items-center gap-3 text-[9px] font-semibold uppercase tracking-wider text-foreground-400 md:flex">
          <span>Effective</span>
          {!readOnly && <span className="w-[118px]">Direct rule</span>}
        </div>
      </div>
      <div>{nodes.map((node) => renderNode(node, 0))}</div>
      {!readOnly && (
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-background-200 bg-background-100/50 px-3.5 py-2 text-[10px] text-foreground-500">
          <span><strong className="font-semibold text-foreground-700">Inherited</strong> keeps group and role access</span>
          <span><strong className="font-semibold text-red-700">Deny</strong> emits an explicit Vault deny</span>
          <span>Folder rules apply recursively</span>
        </div>
      )}
    </section>
  );
}
