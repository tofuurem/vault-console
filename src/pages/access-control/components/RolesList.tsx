import type {
  AccessControlRoleRecord,
  AccessPolicyRecord,
} from '@/application/vault/useAccessControlData';
import type { VaultQueryState } from '@/application/vault/useKvExplorerData';

interface RolesListProps {
  readonly roles: readonly AccessControlRoleRecord[];
  readonly selectedName?: string;
  readonly selectedPolicy: VaultQueryState<AccessPolicyRecord>;
  readonly onSelect: (policyName: string) => void;
}

export default function RolesList({
  roles,
  selectedName,
  selectedPolicy,
  onSelect,
}: RolesListProps) {
  return (
    <section aria-labelledby="roles-heading" className="flex min-h-0 flex-1 flex-col">
      <header className="border-b border-background-200 px-5 py-3">
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">Managed ACL policies</p>
        <div className="flex items-center gap-2">
          <h1 id="roles-heading" className="text-sm font-semibold text-foreground-900">Roles</h1>
          <span className="text-xs text-foreground-400">{roles.length}</span>
        </div>
      </header>
      <div className="flex min-h-0 flex-1">
        <div className={`${selectedName ? 'hidden sm:block' : 'w-full'} shrink-0 overflow-y-auto border-r border-background-200 sm:w-[360px]`}>
          {roles.map((role) => (
            <button
              key={role.id}
              type="button"
              onClick={() => onSelect(role.policyName)}
              className={`w-full border-b border-background-100 px-4 py-3 text-left ${selectedName === role.policyName ? 'border-l-2 border-l-primary-500 bg-primary-50' : 'hover:bg-background-100'}`}
            >
              <span className="block text-sm font-medium text-foreground-800">{role.name}</span>
              <span className="mt-1 block font-mono text-[10px] text-foreground-400">{role.policyName}</span>
            </button>
          ))}
          {roles.length === 0 && (
            <div className="py-16 text-center text-sm text-foreground-500">
              No policies with the <span className="font-mono">vc-role-</span> prefix.
            </div>
          )}
        </div>
        <div className={`${selectedName ? 'flex-1' : 'hidden sm:flex'} min-w-0 overflow-y-auto`}>
          {!selectedName && (
            <div className="m-auto text-center">
              <i className="ri-shield-keyhole-line text-2xl text-foreground-300" aria-hidden="true" />
              <p className="mt-2 text-sm text-foreground-600">Select a role</p>
              <p className="mt-1 text-xs text-foreground-400">The policy body loads only after selection.</p>
            </div>
          )}
          {selectedName && selectedPolicy.status === 'loading' && (
            <div role="status" className="m-auto text-xs text-foreground-500">
              <i className="ri-loader-4-line mr-1 animate-spin" aria-hidden="true" /> Loading role policy…
            </div>
          )}
          {selectedName && selectedPolicy.status === 'error' && (
            <div role="alert" className="m-5 rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
              This role policy could not be loaded: {selectedPolicy.error.message}
            </div>
          )}
          {selectedName && selectedPolicy.status === 'success' && (
            <div className="w-full space-y-4 p-5">
              <h2 className="break-all font-mono text-sm font-semibold text-foreground-900">{selectedPolicy.data.name}</h2>
              {selectedPolicy.data.rules ? (
                selectedPolicy.data.rules.map((rule) => (
                  <div key={rule.pattern} className="rounded-md border border-background-200 p-3">
                    <p className="break-all font-mono text-xs text-foreground-800">{rule.pattern}</p>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {rule.capabilities.map((capability) => (
                        <span key={capability} className="rounded bg-emerald-100 px-1.5 py-0.5 text-[10px] text-emerald-700">
                          {capability}
                        </span>
                      ))}
                    </div>
                  </div>
                ))
              ) : (
                <p className="rounded-md border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  This policy is not readable or cannot be represented safely in the visual model.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
