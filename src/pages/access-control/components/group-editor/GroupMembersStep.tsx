import type { GroupLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import type { GroupEditorDraft } from './group-editor-draft';

function toggle(values: readonly string[], id: string): readonly string[] {
  return values.includes(id)
    ? values.filter((candidate) => candidate !== id)
    : [...values, id];
}

interface GroupMembersStepProps {
  readonly snapshot: GroupLifecycleSnapshot;
  readonly draft: GroupEditorDraft;
  readonly onChange: (draft: GroupEditorDraft) => void;
}

export default function GroupMembersStep({
  snapshot,
  draft,
  onChange,
}: GroupMembersStepProps) {
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
          Direct membership
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground-950">
          Members
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-foreground-500">
          Only direct Identity entity IDs are editable. Nested groups remain visible and are
          preserved exactly.
        </p>
      </div>

      {snapshot.group && snapshot.group.memberGroupIds.length > 0 && (
        <section className="rounded-lg border border-warning-200 bg-warning-50 p-3">
          <p className="text-xs font-semibold text-warning-900">Nested groups are read-only</p>
          <div className="mt-2 flex flex-wrap gap-1.5">
            {snapshot.group.memberGroupIds.map((id) => (
              <span key={id} className="rounded bg-warning-100 px-2 py-1 font-mono text-[9px] text-warning-800">
                {id}
              </span>
            ))}
          </div>
        </section>
      )}

      <section aria-label="Direct Identity members" className="overflow-hidden rounded-lg border border-background-300 bg-background-50">
        <header className="flex items-center justify-between border-b border-background-200 px-4 py-3">
          <div>
            <h3 className="text-xs font-semibold text-foreground-900">Readable entities</h3>
            <p className="mt-0.5 text-[9px] text-foreground-400">
              {draft.memberEntityIds.length} selected
            </p>
          </div>
        </header>
        <div className="max-h-[420px] overflow-y-auto divide-y divide-background-100">
          {snapshot.entities.map((entity) => (
            <label
              key={entity.id}
              className="flex min-h-11 cursor-pointer items-center gap-3 px-4 py-2.5 hover:bg-background-100"
            >
              <input
                type="checkbox"
                checked={draft.memberEntityIds.includes(entity.id)}
                onChange={() => onChange({
                  ...draft,
                  memberEntityIds: toggle(draft.memberEntityIds, entity.id),
                })}
                className="h-4 w-4 rounded border-background-300 text-primary-500 focus:ring-primary-400"
              />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground-800">
                  {entity.name}
                </span>
                <span className="block truncate font-mono text-[9px] text-foreground-400">
                  {entity.id}
                </span>
              </span>
              {entity.disabled && (
                <span className="rounded bg-warning-100 px-1.5 py-0.5 text-[9px] font-semibold text-warning-800">
                  Disabled
                </span>
              )}
            </label>
          ))}
          {snapshot.entities.length === 0 && (
            <p className="px-4 py-10 text-center text-xs text-foreground-400">
              No readable Identity entities.
            </p>
          )}
        </div>
      </section>
    </div>
  );
}
