import { useState } from 'react';

import { useKvDirectory } from '@/application/vault/useKvExplorerData';
import {
  resolveEffectiveKvTree,
  type EffectiveKvAccessTreeNode,
  type KvAccessTreeNode,
} from '@/domain/access-control/effective-access';
import type { KvPermissionLevel } from '@/domain/access-control/permission-presets';
import type { PolicyRule } from '@/domain/access-control/types';
import type { VaultSession } from '@/domain/vault/contracts';
import type { DirectKvAccessRule } from './access';
import DirectAccessEditor from './DirectAccessEditor';

const LEVEL_LABELS: Readonly<Record<EffectiveKvAccessTreeNode['level'], string>> = {
  none: 'No access',
  view: 'View',
  edit: 'Edit',
  'manage-versions': 'Manage versions',
  owner: 'Owner',
  deny: 'Denied',
  custom: 'Custom',
};

const LEVEL_STYLES: Readonly<Record<EffectiveKvAccessTreeNode['level'], string>> = {
  none: 'border-background-300 bg-background-100 text-foreground-500',
  view: 'border-sky-200 bg-sky-50 text-sky-700',
  edit: 'border-amber-200 bg-amber-50 text-amber-700',
  'manage-versions': 'border-emerald-200 bg-emerald-50 text-emerald-700',
  owner: 'border-violet-200 bg-violet-50 text-violet-700',
  deny: 'border-red-200 bg-red-50 text-red-700',
  custom: 'border-background-400 bg-background-100 text-foreground-700',
};

interface LazyPermissionNodeProps {
  readonly node: KvAccessTreeNode;
  readonly depth: number;
  readonly rules: readonly PolicyRule[];
  readonly directRules: readonly DirectKvAccessRule[];
  readonly session: VaultSession;
  readonly onDirectRuleChange: (node: KvAccessTreeNode, level: KvPermissionLevel) => void;
}

function LazyPermissionNode({
  node,
  depth,
  rules,
  directRules,
  session,
  onDirectRuleChange,
}: LazyPermissionNodeProps) {
  const [expanded, setExpanded] = useState(false);
  const listPath = node.path ? `${node.path}/` : '';
  const [directory, refresh] = useKvDirectory(
    session,
    node.mount,
    listPath,
    expanded && node.target === 'folder',
  );
  const effective = resolveEffectiveKvTree([{ ...node, children: [] }], rules)[0];
  const direct = directRules.find((rule) => rule.nodeId === node.id);
  const logicalPath = node.path ? `${node.mount}/${node.path}` : `${node.mount}/`;
  const children = (directory.data ?? []).map((key): KvAccessTreeNode => {
    const folder = key.endsWith('/');
    const label = key.replace(/\/$/, '');
    const path = `${listPath}${key}`.replace(/\/$/, '');
    return {
      id: `${node.mount}:${path}`,
      label,
      mount: node.mount,
      path,
      target: folder ? 'folder' : 'secret',
      children: [],
    };
  });
  const provenance = effective.sources
    .slice(0, 2)
    .map((source) => source.kind === 'group' && source.via
      ? `${source.label} → ${source.via}`
      : source.label)
    .join(', ');

  return (
    <div>
      <div
        data-testid={`permission-node-${node.id}`}
        className="group flex min-h-10 flex-wrap items-center gap-2 border-b border-background-200 px-2.5 py-1.5 hover:bg-background-100/70"
        style={{ paddingLeft: `${10 + depth * 16}px` }}
      >
        {node.target === 'folder' ? (
          <button
            type="button"
            onClick={() => setExpanded((current) => !current)}
            aria-label={`${expanded ? 'Collapse' : 'Expand'} ${logicalPath}`}
            aria-expanded={expanded}
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded text-foreground-400 hover:bg-background-200 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
          >
            <i className={expanded ? 'ri-arrow-down-s-line' : 'ri-arrow-right-s-line'} aria-hidden="true" />
          </button>
        ) : <span className="w-6 shrink-0" />}
        <i className={`${node.target === 'folder' ? 'ri-folder-3-line text-amber-500' : 'ri-key-2-line text-foreground-400'} shrink-0 text-sm`} aria-hidden="true" />
        <div className="min-w-[140px] flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <span className="break-all font-mono text-xs font-medium text-foreground-800">{node.label}</span>
            {direct && (
              <span className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${direct.level === 'deny' ? 'bg-red-100 text-red-700' : 'bg-primary-100 text-primary-700'}`}>
                {direct.level === 'deny' ? 'Direct deny' : 'Direct'}
              </span>
            )}
          </div>
          <p className="mt-0.5 break-all text-[10px] text-foreground-400">
            {provenance || logicalPath}
          </p>
        </div>
        <span
          data-testid={`effective-level-${node.id}`}
          className={`hidden min-w-[92px] justify-center rounded border px-1.5 py-1 text-[10px] font-semibold sm:inline-flex ${LEVEL_STYLES[effective.level]}`}
        >
          {LEVEL_LABELS[effective.level]}
        </span>
        <DirectAccessEditor
          label={logicalPath}
          value={direct?.level ?? 'inherited'}
          onChange={(level) => onDirectRuleChange(node, level)}
        />
      </div>

      {expanded && node.target === 'folder' && (
        <div>
          {directory.status === 'loading' && (
            <div role="status" className="border-b border-background-200 py-2 text-[11px] text-foreground-400" style={{ paddingLeft: `${50 + depth * 16}px` }}>
              <i className="ri-loader-4-line mr-1 animate-spin" aria-hidden="true" /> Loading this prefix…
            </div>
          )}
          {directory.status === 'error' && (
            <div role="alert" className="flex items-center gap-2 border-b border-amber-200 bg-amber-50 py-2 pr-3 text-[11px] text-amber-800" style={{ paddingLeft: `${50 + depth * 16}px` }}>
              <span className="flex-1">
                {directory.error.code === 'authorization'
                  ? 'This token cannot list this prefix.'
                  : 'This prefix could not be loaded.'}
              </span>
              <button type="button" onClick={refresh} className="font-semibold underline">Retry</button>
            </div>
          )}
          {directory.status === 'success' && children.length === 0 && (
            <div className="border-b border-background-200 py-2 text-[11px] text-foreground-400" style={{ paddingLeft: `${50 + depth * 16}px` }}>
              No readable children
            </div>
          )}
          {directory.status === 'success' && children.map((child) => (
            <LazyPermissionNode
              key={child.id}
              node={child}
              depth={depth + 1}
              rules={rules}
              directRules={directRules}
              session={session}
              onDirectRuleChange={onDirectRuleChange}
            />
          ))}
        </div>
      )}
    </div>
  );
}

interface LazyEffectivePermissionTreeProps {
  readonly nodes: readonly KvAccessTreeNode[];
  readonly rules: readonly PolicyRule[];
  readonly directRules: readonly DirectKvAccessRule[];
  readonly session: VaultSession;
  readonly onDirectRuleChange: (node: KvAccessTreeNode, level: KvPermissionLevel) => void;
}

export default function LazyEffectivePermissionTree({
  nodes,
  rules,
  directRules,
  session,
  onDirectRuleChange,
}: LazyEffectivePermissionTreeProps) {
  return (
    <section aria-labelledby="permission-tree-heading" className="overflow-hidden rounded-lg border border-background-300 bg-background-50">
      <div className="border-b border-background-200 px-3.5 py-3">
        <h3 id="permission-tree-heading" className="text-xs font-semibold text-foreground-800">Effective KV access</h3>
        <p className="mt-0.5 text-[11px] leading-4 text-foreground-400">
          Mounts load immediately. A folder is requested from Vault only when you expand it.
        </p>
      </div>
      <div>
        {nodes.map((node) => (
          <LazyPermissionNode
            key={node.id}
            node={node}
            depth={0}
            rules={rules}
            directRules={directRules}
            session={session}
            onDirectRuleChange={onDirectRuleChange}
          />
        ))}
      </div>
      <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-background-200 bg-background-100/50 px-3.5 py-2 text-[10px] text-foreground-500">
        <span><strong className="font-semibold text-foreground-700">Inherited</strong> keeps group and role access</span>
        <span><strong className="font-semibold text-red-700">Deny</strong> emits an explicit Vault deny</span>
        <span>Folder rules apply recursively</span>
      </div>
    </section>
  );
}
