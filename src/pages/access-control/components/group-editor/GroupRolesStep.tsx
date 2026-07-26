import type { GroupLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import type { CreateUserAccessCatalog } from '../create-user/access';
import type { GroupEditorDraft } from './group-editor-draft';

function toggle(values: readonly string[], name: string): readonly string[] {
  return values.includes(name)
    ? values.filter((candidate) => candidate !== name)
    : [...values, name];
}

interface GroupRolesStepProps {
  readonly snapshot: GroupLifecycleSnapshot;
  readonly catalog: CreateUserAccessCatalog;
  readonly draft: GroupEditorDraft;
  readonly onChange: (draft: GroupEditorDraft) => void;
}

export default function GroupRolesStep({
  snapshot,
  catalog,
  draft,
  onChange,
}: GroupRolesStepProps) {
  const managedNames = new Set(catalog.roles.flatMap(({ policyNames }) => policyNames));
  const externalPolicies = snapshot.group?.policies.filter(
    (name) => !managedNames.has(name),
  ) ?? [];
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
          Policy attachments
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground-950">
          Managed roles
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-foreground-500">
          Role policies take effect on the next request. External policies remain attached and
          cannot be changed from this workspace.
        </p>
      </div>

      {externalPolicies.length > 0 && (
        <section className="rounded-lg border border-warning-200 bg-warning-50 p-3">
          <p className="text-xs font-semibold text-warning-900">Preserved external policies</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {externalPolicies.map((name) => (
              <span key={name} className="rounded bg-warning-100 px-2 py-1 font-mono text-[9px] text-warning-800">
                {name}
              </span>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Managed group roles" className="grid gap-3 md:grid-cols-2">
        {catalog.roles.map((role) => {
          const policyName = role.policyNames[0];
          const selected = draft.selectedRolePolicyNames.includes(policyName);
          const rules = catalog.policies.find(({ name }) => name === policyName)?.rules ?? [];
          return (
            <label
              key={role.id}
              className={`cursor-pointer rounded-lg border p-4 transition-colors ${
                selected
                  ? 'border-primary-400 bg-primary-50'
                  : 'border-background-300 bg-background-50 hover:bg-background-100'
              }`}
            >
              <div className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={selected}
                  onChange={() => onChange({
                    ...draft,
                    selectedRolePolicyNames: toggle(
                      draft.selectedRolePolicyNames,
                      policyName,
                    ),
                  })}
                  className="mt-0.5 h-4 w-4 rounded border-background-300 text-primary-500 focus:ring-primary-400"
                />
                <span className="min-w-0 flex-1">
                  <span className="block text-xs font-semibold text-foreground-900">
                    {role.name}
                  </span>
                  <span className="mt-0.5 block truncate font-mono text-[9px] text-foreground-400">
                    {policyName}
                  </span>
                  <span className="mt-2 block text-[9px] text-foreground-500">
                    {rules.length} visual KV rule{rules.length === 1 ? '' : 's'}
                  </span>
                </span>
              </div>
            </label>
          );
        })}
        {catalog.roles.length === 0 && (
          <div className="md:col-span-2 rounded-lg border border-dashed border-background-300 px-4 py-12 text-center text-xs text-foreground-400">
            No Vault Console-managed roles are available.
          </div>
        )}
      </section>
    </div>
  );
}
