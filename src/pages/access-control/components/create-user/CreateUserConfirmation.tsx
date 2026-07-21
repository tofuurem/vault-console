import { useState } from 'react';

import Button from '@/components/base/Button';
import type { DirectKvAccessRule } from './access';
import type { WorkflowOperation } from './workflow';

interface CreateUserConfirmationProps {
  readonly username: string;
  readonly displayName: string;
  readonly userpassMount: string;
  readonly passwordLength: number;
  readonly groupNames: readonly string[];
  readonly inheritedRoleNames: readonly string[];
  readonly directRoleNames: readonly string[];
  readonly directRules: readonly DirectKvAccessRule[];
  readonly generatedHcl: string;
  readonly operations: readonly WorkflowOperation[];
  readonly dangerous: boolean;
  readonly onCancel: () => void;
  readonly onConfirm: () => void;
}

export default function CreateUserConfirmation({
  username,
  displayName,
  userpassMount,
  passwordLength,
  groupNames,
  inheritedRoleNames,
  directRoleNames,
  directRules,
  generatedHcl,
  operations,
  dangerous,
  onCancel,
  onConfirm,
}: CreateUserConfirmationProps) {
  const [dangerConfirmed, setDangerConfirmed] = useState(false);
  const grants = directRules.filter((rule) => rule.level !== 'deny');
  const denies = directRules.filter((rule) => rule.level === 'deny');

  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="grid gap-3 rounded-lg border border-background-200 bg-background-100/60 p-3 text-xs sm:grid-cols-2">
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-foreground-400">Account</p>
          <p className="mt-1 font-mono font-semibold text-foreground-800">{username}</p>
          <p className="mt-0.5 text-foreground-500">{displayName || 'No display name'}</p>
        </div>
        <div>
          <p className="text-[9px] font-semibold uppercase tracking-wider text-foreground-400">Authentication</p>
          <p className="mt-1 font-mono text-foreground-700">auth/{userpassMount}</p>
          <p className="mt-0.5 text-foreground-500">Generated password · {passwordLength} characters</p>
        </div>
      </div>

      <div className="grid gap-4 text-xs sm:grid-cols-2">
        <div>
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-foreground-400">Groups</p>
          {groupNames.length ? <div className="flex flex-wrap gap-1">{groupNames.map((name) => <span key={name} className="rounded bg-secondary-100 px-1.5 py-0.5 text-[11px] text-secondary-700">{name}</span>)}</div> : <p className="text-foreground-400">None</p>}
        </div>
        <div>
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-foreground-400">Roles</p>
          {[...inheritedRoleNames, ...directRoleNames].length ? (
            <div className="space-y-1 text-foreground-600">
              {inheritedRoleNames.map((name) => <p key={`inherited-${name}`}><i className="ri-git-merge-line mr-1.5 text-emerald-600" aria-hidden="true" />{name} <span className="text-[9px] text-foreground-400">via group</span></p>)}
              {directRoleNames.map((name) => <p key={`direct-${name}`}><i className="ri-shield-check-line mr-1.5 text-primary-600" aria-hidden="true" />{name} <span className="text-[9px] text-primary-500">direct</span></p>)}
            </div>
          ) : <p className="text-foreground-400">None</p>}
        </div>
      </div>

      {(grants.length > 0 || denies.length > 0) && (
        <div className="border-t border-background-200 pt-3">
          <p className="mb-1.5 text-[9px] font-semibold uppercase tracking-wider text-foreground-400">Direct path rules</p>
          <div className="space-y-1">
            {directRules.map((rule) => (
              <div key={rule.nodeId} className="flex items-center gap-2 text-[11px]">
                <span className={`rounded px-1.5 py-0.5 font-semibold ${rule.level === 'deny' ? 'bg-red-50 text-red-700' : 'bg-primary-50 text-primary-700'}`}>{rule.level}</span>
                <span className="truncate font-mono text-foreground-600">{rule.mount}/{rule.path || '*'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {dangerous && (
        <label className="flex cursor-pointer items-start gap-2.5 rounded-md border border-violet-200 bg-violet-50 p-3 text-xs text-violet-900">
          <input
            type="checkbox"
            checked={dangerConfirmed}
            onChange={(event) => setDangerConfirmed(event.target.checked)}
            className="mt-0.5 h-3.5 w-3.5 rounded border-violet-300 text-violet-600 focus:ring-violet-400"
          />
          <span>
            <strong className="block font-semibold">Confirm broad or Owner access</strong>
            <span className="mt-0.5 block text-[11px] leading-4 text-violet-700">This user can permanently destroy versions or has recursive access at a mount root.</span>
          </span>
        </label>
      )}

      <details className="rounded-md border border-background-200">
        <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-foreground-600 hover:bg-background-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400">
          <i className="ri-code-line mr-1.5" aria-hidden="true" />Generated HCL
        </summary>
        <pre className="max-h-44 overflow-auto border-t border-background-200 bg-background-950 p-3 font-mono text-[10px] leading-5 text-background-200">{generatedHcl || '# No per-user policy will be created'}</pre>
      </details>

      <details className="rounded-md border border-background-200">
        <summary className="cursor-pointer select-none px-3 py-2 text-[11px] font-medium text-foreground-600 hover:bg-background-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary-400">
          <i className="ri-terminal-box-line mr-1.5" aria-hidden="true" />Vault mutation plan · {operations.length} operations
        </summary>
        <ol className="space-y-1 border-t border-background-200 px-3 py-2 text-[11px] text-foreground-600">
          {operations.map((operation, index) => <li key={operation.id}><span className="mr-2 font-mono text-foreground-400">{String(index + 1).padStart(2, '0')}</span>{operation.label}</li>)}
        </ol>
      </details>

      <div className="flex items-center justify-end gap-2 border-t border-background-200 pt-4">
        <Button type="button" variant="secondary" onClick={onCancel}>Cancel</Button>
        <Button type="button" variant="primary" onClick={onConfirm} disabled={dangerous && !dangerConfirmed}>
          <i className="ri-play-circle-line" aria-hidden="true" /> Create user
        </Button>
      </div>
    </div>
  );
}
