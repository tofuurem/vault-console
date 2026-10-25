import {
  useMemo,
} from 'react';

import type { KvAccessTreeNode } from '@/domain/access-control/effective-access';
import { compileKvV2Policy } from '@/domain/access-control/kv-v2-policy-compiler';
import type { KvPermissionLevel } from '@/domain/access-control/permission-presets';
import type { VaultSession } from '@/domain/vault/contracts';
import CustomAccessTarget from '../create-user/CustomAccessTarget';
import LazyEffectivePermissionTree from '../create-user/LazyEffectivePermissionTree';
import type {
  CreateUserAccessCatalog,
  DirectKvAccessRule,
} from '../create-user/access';
import {
  logicalRoleRules,
  roleSource,
  type RoleEditorDraft,
} from './role-editor-draft';

interface RoleKvAccessStepProps {
  readonly catalog: CreateUserAccessCatalog;
  readonly session: VaultSession;
  readonly draft: RoleEditorDraft;
  readonly readOnly: boolean;
  readonly supported: boolean;
  readonly onChange: (draft: RoleEditorDraft) => void;
}

export default function RoleKvAccessStep({
  catalog,
  session,
  draft,
  readOnly,
  supported,
  onChange,
}: RoleKvAccessStepProps) {
  const source = useMemo(() => roleSource(draft.policyName), [draft.policyName]);
  const logical = useMemo(() => logicalRoleRules(draft), [draft]);
  const compiled = useMemo(() => compileKvV2Policy(logical), [logical]);
  const updateRule = (node: KvAccessTreeNode, level: KvPermissionLevel) => {
    const remaining = draft.directRules.filter(({ nodeId }) => nodeId !== node.id);
    const directRules: readonly DirectKvAccessRule[] = level === 'inherited'
      ? remaining
      : [...remaining, {
          nodeId: node.id,
          mount: node.mount,
          path: node.path,
          target: node.target,
          level,
        }];
    onChange({ ...draft, directRules });
  };

  return (
    <div className="space-y-5">
      <div>
        <p className="text-[11px] font-medium text-foreground-500">
          Permissions
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground-950">
          KV access
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-foreground-500">
          Choose folders or secrets and an access level. Vault Console writes the matching
          KV v2 policy rules, and Vault applies them to the next request.
        </p>
      </div>

      {!supported && (
        <div role="alert" className="rounded-lg border border-warning-300 bg-warning-50 p-4 text-warning-900">
          <p className="text-xs font-semibold">The visual editor cannot show this policy</p>
          <p className="mt-1 text-[10px] leading-4">
            Some of its rules have no visual equivalent, so saving here could change what it
            allows. Adoption and visual editing stay disabled; use the Vault CLI instead.
          </p>
        </div>
      )}

      {supported && readOnly ? (
        <section className="rounded-lg border border-background-300 bg-background-50">
          <header className="border-b border-background-200 px-4 py-3">
            <h3 className="text-xs font-semibold text-foreground-900">Capabilities preserved during adoption</h3>
          </header>
          <div className="divide-y divide-background-100">
            {draft.directRules.map((rule) => (
              <div key={rule.nodeId} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <span className="font-mono text-xs text-foreground-700">
                  {rule.mount}/{rule.path || '*'}
                </span>
                <span className="rounded bg-primary-100 px-2 py-1 text-[10px] font-semibold text-primary-700">
                  {rule.level} · {rule.target}
                </span>
              </div>
            ))}
          </div>
        </section>
      ) : supported ? (
        <>
          <CustomAccessTarget
            mounts={catalog.tree}
            source={source}
            directRules={draft.directRules}
            onDirectRuleChange={updateRule}
          />
          <div className="grid items-start gap-3 xl:grid-cols-[minmax(0,1fr)_240px]">
            <LazyEffectivePermissionTree
              nodes={catalog.tree}
              rules={compiled.rules}
              directRules={draft.directRules}
              session={session}
              onDirectRuleChange={updateRule}
            />
            <aside className="rounded-lg border border-background-300 bg-background-50 p-4 xl:sticky xl:top-4">
              <p className="text-[11px] font-medium text-foreground-500">
                Role output
              </p>
              <dl className="mt-3 grid grid-cols-2 gap-2 text-center">
                <div className="rounded-md bg-background-100 p-2">
                  <dt className="text-[10px] uppercase text-foreground-400">Targets</dt>
                  <dd className="mt-1 font-mono text-lg font-semibold text-foreground-900">
                    {draft.directRules.length}
                  </dd>
                </div>
                <div className="rounded-md bg-background-100 p-2">
                  <dt className="text-[10px] uppercase text-foreground-400">HCL paths</dt>
                  <dd className="mt-1 font-mono text-lg font-semibold text-foreground-900">
                    {compiled.rules.length}
                  </dd>
                </div>
              </dl>
              <p className="mt-3 text-[10px] leading-4 text-foreground-500">
                Deny targets remain explicit. Owner targets include permanent version
                destruction and require typed confirmation.
              </p>
            </aside>
          </div>
        </>
      ) : null}
    </div>
  );
}
