import type { UserLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import type { CreateUserAccessCatalog } from '../create-user/access';
import type { UserEditorDraft } from './user-editor-draft';

interface UserGroupsRolesStepProps {
  readonly snapshot: UserLifecycleSnapshot;
  readonly catalog: CreateUserAccessCatalog;
  readonly draft: UserEditorDraft;
  readonly onChange: (draft: UserEditorDraft) => void;
}

function toggle(values: readonly string[], value: string): readonly string[] {
  return values.includes(value)
    ? values.filter((candidate) => candidate !== value)
    : [...values, value];
}

export default function UserGroupsRolesStep({
  snapshot,
  catalog,
  draft,
  onChange,
}: UserGroupsRolesStepProps) {
  const selectedGroups = new Set(draft.groupIds);
  const inheritedRoleIds = new Set(
    catalog.groups
      .filter(({ id }) => selectedGroups.has(id))
      .flatMap(({ roleIds }) => roleIds),
  );
  const hasIdentity = Boolean(snapshot.entity);

  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
          Access sources
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground-950">
          Groups and direct roles
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-foreground-500">
          Groups provide Identity policies live on the next request. Direct userpass roles are
          attached to tokens created on the next login.
        </p>
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <section className="rounded-lg border border-background-300 bg-background-50">
          <header className="border-b border-background-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-foreground-400">
                  Identity
                </p>
                <h3 className="mt-0.5 text-sm font-semibold text-foreground-900">Internal groups</h3>
              </div>
              <span className="font-mono text-[10px] text-foreground-400">
                {draft.groupIds.length} selected
              </span>
            </div>
          </header>
          <div className="max-h-[420px] divide-y divide-background-100 overflow-y-auto p-2">
            {snapshot.groups.map((group) => {
              const internal = (group.type ?? 'internal') === 'internal';
              const checked = draft.groupIds.includes(group.id);
              return (
                <label
                  key={group.id}
                  className={`flex min-h-12 items-start gap-3 rounded-md px-2.5 py-2 ${
                    internal && hasIdentity
                      ? 'cursor-pointer hover:bg-background-100'
                      : 'cursor-not-allowed opacity-60'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-background-400 text-primary-600 focus:ring-primary-400"
                    checked={checked}
                    disabled={!internal || !hasIdentity}
                    onChange={() => onChange({
                      ...draft,
                      groupIds: toggle(draft.groupIds, group.id),
                    })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="flex items-center gap-1.5 text-xs font-semibold text-foreground-800">
                      {group.name}
                      <span className={`rounded-sm px-1 py-0.5 font-mono text-[8px] uppercase ${
                        group.metadata.managed_by === 'vault-console'
                          ? 'bg-primary-100 text-primary-700'
                          : 'bg-background-200 text-foreground-500'
                      }`}>
                        {group.metadata.managed_by === 'vault-console' ? 'managed' : 'existing'}
                      </span>
                    </span>
                    <span className="mt-0.5 block font-mono text-[9px] text-foreground-400">
                      {group.policies.length} policies · {group.memberEntityIds.length} members
                    </span>
                  </span>
                </label>
              );
            })}
            {snapshot.groups.length === 0 && (
              <p className="px-3 py-10 text-center text-xs text-foreground-400">
                No readable Identity groups.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-lg border border-background-300 bg-background-50">
          <header className="border-b border-background-200 px-4 py-3">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-foreground-400">
                  Userpass
                </p>
                <h3 className="mt-0.5 text-sm font-semibold text-foreground-900">Direct managed roles</h3>
              </div>
              <span className="font-mono text-[10px] text-foreground-400">
                {draft.directRoleIds.length} selected
              </span>
            </div>
          </header>
          <div className="max-h-[420px] divide-y divide-background-100 overflow-y-auto p-2">
            {catalog.roles.map((role) => {
              const inherited = inheritedRoleIds.has(role.id);
              const checked = draft.directRoleIds.includes(role.id);
              return (
                <label
                  key={role.id}
                  className={`flex min-h-12 items-start gap-3 rounded-md px-2.5 py-2 ${
                    inherited ? 'cursor-not-allowed opacity-60' : 'cursor-pointer hover:bg-background-100'
                  }`}
                >
                  <input
                    type="checkbox"
                    className="mt-0.5 h-4 w-4 rounded border-background-400 text-primary-600 focus:ring-primary-400"
                    checked={checked}
                    disabled={inherited}
                    onChange={() => onChange({
                      ...draft,
                      directRoleIds: toggle(draft.directRoleIds, role.id),
                    })}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="text-xs font-semibold text-foreground-800">{role.name}</span>
                    <span className="mt-0.5 block font-mono text-[9px] text-foreground-400">
                      {role.policyNames.join(', ')}
                    </span>
                    {inherited && (
                      <span className="mt-1 inline-flex rounded-sm bg-secondary-100 px-1.5 py-0.5 text-[9px] text-secondary-700">
                        inherited from selected group
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
            {catalog.roles.length === 0 && (
              <p className="px-3 py-10 text-center text-xs text-foreground-400">
                No editable managed roles.
              </p>
            )}
          </div>
        </section>
      </div>

      {snapshot.account.tokenPolicies.some((name) => (
        name !== 'default'
        && !catalog.roles.some((role) => role.policyNames.includes(name))
        && name !== snapshot.directPolicy?.name
      )) && (
        <aside className="rounded-lg border border-warning-200 bg-warning-50 p-3">
          <p className="text-[10px] font-semibold text-warning-900">External token policies are preserved</p>
          <p className="mt-1 break-all font-mono text-[9px] leading-4 text-warning-800">
            {snapshot.account.tokenPolicies
              .filter((name) => (
                name !== 'default'
                && !catalog.roles.some((role) => role.policyNames.includes(name))
                && name !== snapshot.directPolicy?.name
              ))
              .join(', ')}
          </p>
        </aside>
      )}
    </div>
  );
}
