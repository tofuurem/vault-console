import { Input } from '@/components/base/Input';
import { SelectField } from './DatabaseUi';

interface ConnectionFieldProps {
  readonly value: string;
  /** Undefined when the token cannot list connections; the field becomes free text. */
  readonly connectionNames: readonly string[] | undefined;
  readonly error?: string;
  readonly onChange: (value: string) => void;
}

/** Picks the connection a role uses. */
export default function ConnectionField({ value, connectionNames, error, onChange }: ConnectionFieldProps) {
  if (!connectionNames) {
    return (
      <Input
        label="Connection"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        hint="Connections could not be listed. Enter the connection name."
        error={error}
        spellCheck={false}
        monospace
      />
    );
  }
  const options = value && !connectionNames.includes(value) ? [value, ...connectionNames] : connectionNames;
  return (
    <SelectField
      label="Connection"
      value={value}
      onChange={(event) => onChange(event.target.value)}
      error={error}
      className="font-mono"
    >
      <option value="">Choose a connection</option>
      {options.map((name) => <option key={name} value={name}>{name}</option>)}
    </SelectField>
  );
}
