import {
  Input,
  Textarea,
} from '@/components/base/Input';
import type { RoleLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import { ROLE_POLICY_PREFIX } from '@/domain/access-control/policy-ownership';
import type { RoleEditorDraft } from './role-editor-draft';

interface RoleOverviewStepProps {
  readonly mode: 'create' | 'edit' | 'adopt';
  readonly snapshot: RoleLifecycleSnapshot;
  readonly draft: RoleEditorDraft;
  readonly nameError?: string;
  readonly onChange: (draft: RoleEditorDraft) => void;
}

export default function RoleOverviewStep({
  mode,
  snapshot,
  draft,
  nameError,
  onChange,
}: RoleOverviewStepProps) {
  const slug = draft.policyName.startsWith(ROLE_POLICY_PREFIX)
    ? draft.policyName.slice(ROLE_POLICY_PREFIX.length)
    : draft.policyName;
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
          Role identity
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground-950">
          Overview
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-foreground-500">
          A role is a Vault ACL policy with an immutable reserved identifier and a canonical
          Vault Console ownership header.
        </p>
      </div>

      {mode === 'adopt' && (
        <div className="rounded-lg border border-warning-300 bg-warning-50 p-4 text-warning-900">
          <p className="text-xs font-semibold">Adopt an Unverified role policy</p>
          <p className="mt-1 text-[10px] leading-4">
            Apply adds only the ownership header and description. The policy body and every
            capability remain unchanged. Editing becomes available after adoption succeeds.
          </p>
        </div>
      )}

      <section className="grid gap-4 rounded-lg border border-background-300 bg-background-50 p-4 md:grid-cols-2">
        {mode === 'create' ? (
          <div className="block">
            <label htmlFor="role-slug" className="text-xs font-medium text-foreground-700">
              Role identifier
            </label>
            <span className={`mt-1 flex h-11 overflow-hidden rounded-md border bg-background-50 focus-within:ring-2 sm:h-8 ${
              nameError
                ? 'border-danger-400 focus-within:border-danger-400 focus-within:ring-danger-400/30'
                : 'border-background-300 focus-within:border-primary-400 focus-within:ring-primary-400/30'
            }`}>
              <span className="flex items-center border-r border-background-300 bg-background-100 px-2.5 font-mono text-xs text-foreground-500">
                {ROLE_POLICY_PREFIX}
              </span>
              <input
                id="role-slug"
                value={slug}
                onChange={(event) => onChange({
                  ...draft,
                  policyName: `${ROLE_POLICY_PREFIX}${event.target.value.toLowerCase()}`,
                })}
                autoComplete="off"
                spellCheck={false}
                placeholder="platform-reader"
                aria-invalid={Boolean(nameError)}
                aria-describedby={nameError ? 'role-slug-error' : undefined}
                className="min-w-0 flex-1 px-2.5 font-mono text-xs text-foreground-900 outline-none"
              />
            </span>
            {nameError && (
              <span id="role-slug-error" className="mt-1 block text-xs text-danger-500">
                {nameError}
              </span>
            )}
          </div>
        ) : (
          <div className="rounded-md border border-background-200 bg-background-100 px-3 py-2.5">
            <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-foreground-400">
              Immutable policy name
            </p>
            <p className="mt-1 break-all font-mono text-xs font-semibold text-foreground-800">
              {snapshot.policy?.name}
            </p>
          </div>
        )}
        <div className="rounded-md border border-background-200 bg-background-100 px-3 py-2.5">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-foreground-400">
            Ownership state
          </p>
          <p className="mt-1 text-xs font-semibold capitalize text-foreground-800">
            {mode === 'create' ? 'New managed role' : snapshot.ownership}
          </p>
        </div>
        <div className="md:col-span-2">
          <Textarea
            id="role-description"
            label="Description"
            rows={4}
            value={draft.description}
            onChange={(event) => onChange({ ...draft, description: event.target.value })}
            placeholder="Describe the access this role grants."
          />
        </div>
      </section>

      {mode === 'create' && (
        <Input
          label="Resulting policy name"
          value={draft.policyName}
          readOnly
          monospace
          aria-label="Resulting policy name"
        />
      )}
    </div>
  );
}
