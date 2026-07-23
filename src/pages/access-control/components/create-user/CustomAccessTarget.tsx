import {
  useState,
  type FormEvent,
} from 'react';

import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';
import type { KvAccessTreeNode } from '@/domain/access-control/effective-access';
import {
  compileKvV2Rule,
  type KvAccessTarget,
  type LogicalKvAccessRule,
} from '@/domain/access-control/kv-v2-policy-compiler';
import {
  logicalKvTargetPathError,
  normalizeLogicalKvTargetPath,
} from '@/domain/access-control/logical-kv-target';
import type { KvPermissionLevel } from '@/domain/access-control/permission-presets';
import type { PolicySource } from '@/domain/access-control/types';
import type { DirectKvAccessRule } from './access';
import DirectAccessEditor from './DirectAccessEditor';

const LEVELS: readonly {
  readonly value: Exclude<KvPermissionLevel, 'inherited'>;
  readonly label: string;
}[] = [
  { value: 'view', label: 'View' },
  { value: 'edit', label: 'Edit' },
  { value: 'manage-versions', label: 'Manage versions' },
  { value: 'owner', label: 'Owner' },
  { value: 'deny', label: 'Deny' },
];

interface CustomAccessTargetProps {
  readonly mounts: readonly KvAccessTreeNode[];
  readonly source: PolicySource;
  readonly directRules: readonly DirectKvAccessRule[];
  readonly onDirectRuleChange: (node: KvAccessTreeNode, level: KvPermissionLevel) => void;
}

export default function CustomAccessTarget({
  mounts,
  source,
  directRules,
  onDirectRuleChange,
}: CustomAccessTargetProps) {
  const [mount, setMount] = useState(mounts[0]?.mount ?? '');
  const [path, setPath] = useState('');
  const [target, setTarget] = useState<KvAccessTarget>('folder');
  const [level, setLevel] = useState<Exclude<KvPermissionLevel, 'inherited'>>('view');
  const [showErrors, setShowErrors] = useState(false);
  const normalizedPath = normalizeLogicalKvTargetPath(path);
  const pathError = logicalKvTargetPathError(path, target);
  const mountError = mount ? undefined : 'Choose a KV v2 mount.';
  const nodeId = `${mount}:${normalizedPath}`;
  const existing = directRules.some((rule) => rule.nodeId === nodeId);
  const logicalRule: LogicalKvAccessRule | undefined = mount && !pathError
    ? { mount, path: normalizedPath, target, level, source }
    : undefined;
  const preview = logicalRule ? compileKvV2Rule(logicalRule) : [];

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setShowErrors(true);
    if (mountError || pathError) return;
    const label = normalizedPath.split('/').at(-1) || mount;
    onDirectRuleChange({
      id: nodeId,
      label,
      mount,
      path: normalizedPath,
      target,
      children: [],
    }, level);
    setShowErrors(false);
  };

  return (
    <section aria-labelledby="custom-target-heading" className="mb-4 rounded-lg border border-background-300 bg-background-50">
      <div className="border-b border-background-200 px-3.5 py-3">
        <h3 id="custom-target-heading" className="text-xs font-semibold text-foreground-800">Add a path directly</h3>
        <p className="mt-0.5 text-[11px] leading-4 text-foreground-400">
          Use this for a future path or a prefix that this token cannot list. No secret needs to exist yet.
        </p>
      </div>
      <form onSubmit={submit} className="space-y-3 p-3.5">
        <div className="grid gap-3 sm:grid-cols-[minmax(120px,0.75fr)_minmax(180px,1.5fr)] lg:grid-cols-[minmax(120px,0.65fr)_minmax(200px,1.5fr)_minmax(130px,0.7fr)_minmax(150px,0.8fr)_auto] lg:items-end">
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground-700">
            KV mount
            <select
              aria-label="KV mount"
              value={mount}
              onChange={(event) => setMount(event.target.value)}
              className="h-8 rounded-md border border-background-300 bg-background-50 px-2.5 font-mono text-xs text-foreground-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30"
            >
              {mounts.map((candidate) => <option key={candidate.mount} value={candidate.mount}>{candidate.mount}</option>)}
            </select>
            {showErrors && mountError && <span className="text-xs text-red-500">{mountError}</span>}
          </label>
          <Input
            label="Logical path"
            value={path}
            onChange={(event) => setPath(event.target.value)}
            placeholder={target === 'folder' ? 'future/database' : 'future/database/password'}
            error={showErrors ? pathError : undefined}
            monospace
          />
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground-700">
            Target
            <select
              aria-label="Target type"
              value={target}
              onChange={(event) => setTarget(event.target.value as KvAccessTarget)}
              className="h-8 rounded-md border border-background-300 bg-background-50 px-2.5 text-xs text-foreground-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30"
            >
              <option value="folder">Folder / prefix</option>
              <option value="secret">Single secret</option>
            </select>
          </label>
          <label className="flex flex-col gap-1 text-xs font-medium text-foreground-700">
            Access
            <select
              aria-label="Access level"
              value={level}
              onChange={(event) => setLevel(event.target.value as Exclude<KvPermissionLevel, 'inherited'>)}
              className="h-8 rounded-md border border-background-300 bg-background-50 px-2.5 text-xs text-foreground-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30"
            >
              {LEVELS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
            </select>
          </label>
          <Button type="submit" variant="secondary" size="md">
            <i className={existing ? 'ri-refresh-line' : 'ri-add-line'} aria-hidden="true" />
            {existing ? 'Update target' : 'Add target'}
          </Button>
        </div>

        {logicalRule && (
          <div className="rounded-md border border-background-200 bg-background-100/60 p-3">
            <p className="break-all font-mono text-[11px] font-semibold text-foreground-700">
              {mount}/{normalizedPath || '*'} · {target}
            </p>
            <div className="mt-2 grid gap-1.5 md:grid-cols-2">
              {preview.map((rule) => (
                <div key={rule.pattern} className="min-w-0 rounded border border-background-200 bg-background-50 px-2 py-1.5">
                  <p className="break-all font-mono text-[10px] text-foreground-700">{rule.pattern}</p>
                  <p className="mt-0.5 break-all font-mono text-[9px] text-primary-600">{rule.capabilities.join(', ')}</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {directRules.length > 0 && (
          <div>
            <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-foreground-400">Current per-user targets</p>
            <div className="space-y-1.5">
              {directRules.map((rule) => {
                const node: KvAccessTreeNode = {
                  id: rule.nodeId,
                  label: rule.path.split('/').at(-1) || rule.mount,
                  mount: rule.mount,
                  path: rule.path,
                  target: rule.target,
                  children: [],
                };
                return (
                  <div key={rule.nodeId} className="flex flex-col gap-2 rounded-md border border-background-200 px-2.5 py-2 sm:flex-row sm:items-center">
                    <div className="min-w-0 flex-1">
                      <p className="break-all font-mono text-[11px] text-foreground-800">{rule.mount}/{rule.path || '*'}</p>
                      <p className="text-[9px] uppercase tracking-wider text-foreground-400">{rule.target}</p>
                    </div>
                    <DirectAccessEditor
                      label={`${rule.mount}/${rule.path || '*'}`}
                      value={rule.level}
                      onChange={(nextLevel) => onDirectRuleChange(node, nextLevel)}
                    />
                    <button
                      type="button"
                      aria-label={`Remove direct target ${rule.mount}/${rule.path || '*'}`}
                      onClick={() => onDirectRuleChange(node, 'inherited')}
                      className="flex h-7 items-center justify-center rounded-md px-2 text-xs text-red-600 hover:bg-red-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-300"
                    >
                      <i className="ri-close-line mr-1" aria-hidden="true" /> Remove
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </form>
    </section>
  );
}
