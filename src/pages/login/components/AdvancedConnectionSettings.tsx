import Button from '@/components/base/Button';
import { Input } from '@/components/base/Input';

interface AdvancedConnectionSettingsProps {
  readonly showAddress: boolean;
  readonly showMount: boolean;
  readonly serverUrl: string;
  readonly serverError: string;
  readonly checking: boolean;
  readonly userpassPath: string;
  readonly onServerUrlChange: (value: string) => void;
  readonly onTest: () => void;
  readonly onUserpassPathChange: (value: string) => void;
}

export default function AdvancedConnectionSettings({
  showAddress,
  showMount,
  serverUrl,
  serverError,
  checking,
  userpassPath,
  onServerUrlChange,
  onTest,
  onUserpassPathChange,
}: AdvancedConnectionSettingsProps) {
  if (!showAddress && !showMount) return null;
  return (
    <details className="border-b border-background-200 px-6 py-3">
      <summary className="cursor-pointer rounded text-[11px] font-medium text-foreground-600 hover:text-foreground-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400">
        Advanced connection settings
      </summary>
      <div className="mt-3 space-y-3">
        {showAddress && (
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-end gap-2">
            <Input
              id="vault-address"
              label="Vault server"
              type="url"
              value={serverUrl}
              onChange={(event) => onServerUrlChange(event.target.value)}
              error={serverError}
              placeholder="https://vault.example.com:8200"
              monospace
              spellCheck={false}
            />
            <Button type="button" size="md" onClick={onTest} loading={checking}>
              Test
            </Button>
          </div>
        )}
        {showMount && (
          <Input
            id="userpass-mount"
            label="Auth mount path"
            value={userpassPath}
            onChange={(event) => onUserpassPathChange(event.target.value)}
            placeholder="userpass"
            autoComplete="off"
            monospace
            icon="ri-folder-3-line"
          />
        )}
      </div>
    </details>
  );
}
