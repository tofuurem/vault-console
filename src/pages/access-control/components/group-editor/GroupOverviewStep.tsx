import {
  Input,
  Textarea,
} from '@/components/base/Input';
import type { GroupLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import { assessIdentityOwnership } from '@/domain/access-control/resource-ownership';
import type { GroupEditorDraft } from './group-editor-draft';

interface GroupOverviewStepProps {
  readonly snapshot: GroupLifecycleSnapshot;
  readonly draft: GroupEditorDraft;
  readonly nameError?: string;
  readonly onChange: (draft: GroupEditorDraft) => void;
}

export default function GroupOverviewStep({
  snapshot,
  draft,
  nameError,
  onChange,
}: GroupOverviewStepProps) {
  const group = snapshot.group;
  const creating = !group;
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
          Group identity
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground-950">
          Overview
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-foreground-500">
          Vault Console creates internal groups and owns only their name, description,
          direct members, and managed-role attachments.
        </p>
      </div>

      <section className="grid gap-4 rounded-lg border border-background-300 bg-background-50 p-4 md:grid-cols-2">
        <Input
          id="group-name"
          label="Group name"
          value={draft.name}
          onChange={(event) => onChange({ ...draft, name: event.target.value })}
          autoComplete="off"
          error={nameError}
          required
        />
        <div className="rounded-md border border-background-200 bg-background-100 px-3 py-2.5">
          <p className="font-mono text-[9px] uppercase tracking-[0.12em] text-foreground-400">
            Group type
          </p>
          <p className="mt-1 text-xs font-semibold text-foreground-800">
            {creating ? 'Internal (new)' : group.type ?? 'internal'}
          </p>
        </div>
        <div className="md:col-span-2">
          <Textarea
            id="group-description"
            label="Description"
            rows={4}
            value={draft.description}
            onChange={(event) => onChange({ ...draft, description: event.target.value })}
            placeholder="What access or team does this group represent?"
          />
        </div>
      </section>

      {group && (
        <section className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-lg border border-background-300 bg-background-50 p-3">
            <p className="font-mono text-[9px] uppercase text-foreground-400">Ownership</p>
            <p className="mt-1 text-xs font-semibold text-foreground-800">
              {assessIdentityOwnership(group.metadata) === 'managed'
                ? 'Vault Console managed'
                : 'External / read-only'}
            </p>
          </div>
          <div className="rounded-lg border border-background-300 bg-background-50 p-3">
            <p className="font-mono text-[9px] uppercase text-foreground-400">Nested groups</p>
            <p className="mt-1 font-mono text-xs font-semibold text-foreground-800">
              {group.memberGroupIds.length}
            </p>
          </div>
          <div className="rounded-lg border border-background-300 bg-background-50 p-3">
            <p className="font-mono text-[9px] uppercase text-foreground-400">Parent groups</p>
            <p className="mt-1 font-mono text-xs font-semibold text-foreground-800">
              {snapshot.parentGroups.length}
            </p>
          </div>
        </section>
      )}
    </div>
  );
}
