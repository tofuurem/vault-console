import type { RoleLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';

export default function RoleDependenciesStep({
  snapshot,
}: {
  readonly snapshot: RoleLifecycleSnapshot;
}) {
  const users = snapshot.dependencies.filter(({ kind }) => kind === 'user');
  const groups = snapshot.dependencies.filter(({ kind }) => kind === 'group');
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
          Blast radius
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground-950">
          Dependencies
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-foreground-500">
          Role edits are live on the next request for every direct user, Identity entity, and
          group that references this policy.
        </p>
      </div>

      {!snapshot.visibility.complete && (
        <div role="alert" className="rounded-lg border border-warning-300 bg-warning-50 p-4 text-warning-900">
          <p className="text-xs font-semibold">Incomplete dependency picture</p>
          <ul className="mt-1 list-disc pl-4 text-[10px] leading-4">
            {snapshot.visibility.reasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        {[
          { title: 'Users and entities', values: users, icon: 'ri-user-line' },
          { title: 'Identity groups', values: groups, icon: 'ri-group-line' },
        ].map((section) => (
          <section key={section.title} className="rounded-lg border border-background-300 bg-background-50">
            <header className="flex items-center justify-between border-b border-background-200 px-4 py-3">
              <h3 className="text-xs font-semibold text-foreground-900">{section.title}</h3>
              <span className="font-mono text-[10px] text-foreground-400">{section.values.length}</span>
            </header>
            <div className="divide-y divide-background-100">
              {section.values.map((dependency) => (
                <div key={`${dependency.kind}:${dependency.id}`} className="flex items-center gap-3 px-4 py-3">
                  <i className={`${section.icon} text-foreground-400`} aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block truncate text-xs font-semibold text-foreground-800">
                      {dependency.name}
                    </span>
                    <span className="block truncate font-mono text-[9px] text-foreground-400">
                      {dependency.id}
                    </span>
                  </span>
                </div>
              ))}
              {section.values.length === 0 && (
                <p className="px-4 py-10 text-center text-xs text-foreground-400">No references.</p>
              )}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
