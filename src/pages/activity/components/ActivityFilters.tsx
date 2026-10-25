import { Input } from '@/components/base/Input';
import { AUDIT_OPERATIONS, type AuditFilter, type AuditOutcome } from '@/domain/audit/audit-events';

interface ActivityFiltersProps {
  readonly filter: AuditFilter;
  readonly onChange: (filter: AuditFilter) => void;
}

const SELECT = 'h-11 rounded-md border border-background-300 bg-background-50 px-2.5 text-xs text-foreground-900 focus:border-primary-400 focus:outline-none focus:ring-1 focus:ring-primary-400/30 sm:h-8';
const OUTCOMES: readonly (readonly [AuditOutcome | '', string])[] = [['', 'All'], ['ok', 'Succeeded'], ['error', 'Failed']];

export default function ActivityFilters({ filter, onChange }: ActivityFiltersProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <div className="min-w-[14rem] flex-[3_1_14rem]">
        <Input
          label="Search"
          type="search"
          icon="ri-search-line"
          placeholder="Path, user, or error"
          value={filter.text ?? ''}
          onChange={(event) => onChange({ ...filter, text: event.target.value })}
        />
      </div>
      <div className="min-w-[9rem] flex-[1_1_9rem]">
        <Input
          label="User"
          placeholder="alice"
          value={filter.actor ?? ''}
          onChange={(event) => onChange({ ...filter, actor: event.target.value })}
        />
      </div>
      <label className="flex min-w-[8rem] flex-[1_1_8rem] flex-col gap-1 text-xs font-medium text-foreground-700">
        Operation
        <select
          className={SELECT}
          value={filter.operation ?? ''}
          onChange={(event) => onChange({ ...filter, operation: event.target.value || undefined })}
        >
          <option value="">Any</option>
          {AUDIT_OPERATIONS.map((operation) => <option key={operation} value={operation}>{operation}</option>)}
        </select>
      </label>
      <div role="radiogroup" aria-label="Outcome" className="inline-flex shrink-0 rounded-md border border-background-300 bg-background-50 p-0.5">
        {OUTCOMES.map(([value, label]) => (
          <button
            key={label}
            type="button"
            role="radio"
            aria-checked={(filter.outcome ?? '') === value}
            onClick={() => onChange({ ...filter, outcome: value || undefined })}
            className={`min-h-10 rounded px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 sm:min-h-7 ${
              (filter.outcome ?? '') === value ? 'bg-primary-100 text-primary-700' : 'text-foreground-600 hover:text-foreground-900'
            }`}
          >
            {label}
          </button>
        ))}
      </div>
      <label className="flex min-h-11 shrink-0 cursor-pointer items-center gap-2 text-xs text-foreground-700 sm:min-h-8">
        <input
          type="checkbox"
          checked={filter.showRoutine === true}
          onChange={(event) => onChange({ ...filter, showRoutine: event.target.checked || undefined })}
          className="h-4 w-4 rounded border-background-300 text-primary-600 focus-visible:ring-2 focus-visible:ring-primary-400"
        />
        Show routine checks
      </label>
    </div>
  );
}
