import type { KvPermissionLevel } from '@/domain/access-control/permission-presets';

const DIRECT_ACCESS_LEVELS: readonly { value: KvPermissionLevel; label: string }[] = [
  { value: 'inherited', label: 'Inherited' },
  { value: 'view', label: 'View' },
  { value: 'edit', label: 'Edit' },
  { value: 'manage-versions', label: 'Manage versions' },
  { value: 'owner', label: 'Owner' },
  { value: 'deny', label: 'Deny' },
];

interface DirectAccessEditorProps {
  readonly label: string;
  readonly value: KvPermissionLevel;
  readonly onChange: (level: KvPermissionLevel) => void;
}

export default function DirectAccessEditor({ label, value, onChange }: DirectAccessEditorProps) {
  return (
    <select
      aria-label={`Direct access for ${label}`}
      value={value}
      onChange={(event) => onChange(event.target.value as KvPermissionLevel)}
      onClick={(event) => event.stopPropagation()}
      className={`h-7 min-w-[118px] rounded-md border px-2 text-[11px] font-medium outline-none transition focus-visible:ring-2 focus-visible:ring-primary-300 ${
        value === 'deny'
          ? 'border-red-300 bg-red-50 text-red-700'
          : value === 'owner'
            ? 'border-violet-300 bg-violet-50 text-violet-700'
            : value === 'inherited'
              ? 'border-background-300 bg-background-50 text-foreground-500'
              : 'border-primary-200 bg-primary-50 text-primary-700'
      }`}
    >
      {DIRECT_ACCESS_LEVELS.map((level) => (
        <option key={level.value} value={level.value}>
          {level.label}
        </option>
      ))}
    </select>
  );
}
