import Button from '@/components/base/Button';
import { assessPassword } from '@/domain/access-control/password';
import type { PlanExecutionResult } from '@/domain/access-control/lifecycle/model';
import PlanExecutionNotice from '../workspace/PlanExecutionNotice';
import LifecyclePanelFooter from './LifecyclePanelFooter';
import type { PasswordMode } from './useUserLifecycleActions';

const PASSWORD_MODES: readonly PasswordMode[] = ['generated', 'manual'];

interface ResetPasswordPanelProps {
  readonly password: string;
  readonly passwordMode: PasswordMode;
  readonly result: PlanExecutionResult | undefined;
  readonly applying: boolean;
  readonly resetAllowed: boolean;
  readonly onModeChange: (mode: PasswordMode) => void;
  readonly onPasswordChange: (password: string) => void;
  readonly onRegenerate: () => void;
  readonly onBack: () => void;
  readonly onSubmit: () => void;
}

export default function ResetPasswordPanel({
  password,
  passwordMode,
  result,
  applying,
  resetAllowed,
  onModeChange,
  onPasswordChange,
  onRegenerate,
  onBack,
  onSubmit,
}: ResetPasswordPanelProps) {
  const passwordStrength = assessPassword(password);
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="rounded-md border border-warning-200 bg-warning-50 p-3 text-[10px] leading-4 text-warning-800">
        The old password cannot be read or restored. Reset affects future logins only;
        existing tokens are not revoked. Use Disable for immediate identity-associated
        token blocking.
      </div>
      <div role="tablist" aria-label="Password source" className="grid grid-cols-2 gap-2">
        {PASSWORD_MODES.map((mode) => (
          <button
            key={mode}
            type="button"
            role="tab"
            aria-selected={passwordMode === mode}
            onClick={() => onModeChange(mode)}
            className={`rounded-md border px-3 py-2 text-xs font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 ${
              passwordMode === mode
                ? 'border-primary-400 bg-primary-50 text-primary-800'
                : 'border-background-300 text-foreground-600'
            }`}
          >
            {mode === 'generated' ? 'Generate securely' : 'Enter manually'}
          </button>
        ))}
      </div>
      {passwordMode === 'generated' ? (
        <div className="rounded-lg border border-background-300 bg-background-100 p-4">
          <p className="text-xs font-semibold text-foreground-800">New password prepared</p>
          <p className="mt-1 text-[10px] leading-4 text-foreground-500">
            A {password.length}-character {passwordStrength.label.toLowerCase()} password
            is held in memory. It can be revealed or copied only after Vault confirms
            the reset.
          </p>
          <Button
            type="button"
            size="sm"
            className="mt-3"
            onClick={onRegenerate}
          >
            <i className="ri-refresh-line" aria-hidden="true" /> Regenerate
          </Button>
        </div>
      ) : (
        <label className="block">
          <span className="text-xs font-medium text-foreground-700">New password</span>
          <input
            name="new-password"
            type="password"
            value={password}
            onChange={(event) => onPasswordChange(event.target.value)}
            autoComplete="new-password"
            spellCheck={false}
            className="mt-1 h-11 w-full rounded-md border border-background-300 bg-background-50 px-3 font-mono text-sm text-foreground-900 outline-none focus:border-primary-400 focus:ring-2 focus:ring-primary-200"
          />
          <span className={`mt-1 block text-[10px] ${
            password.length > 0 && password.length < 16
              ? 'text-danger-600'
              : 'text-foreground-400'
          }`}>
            {password.length < 16
              ? 'Use at least 16 characters.'
              : `${passwordStrength.label} · ${password.length} characters`}
          </span>
        </label>
      )}
      <PlanExecutionNotice result={result} />
      <LifecyclePanelFooter applying={applying} onBack={onBack}>
        <Button
          type="button"
          size="sm"
          variant="primary"
          loading={applying}
          disabled={!resetAllowed || password.length < 16}
          onClick={onSubmit}
        >
          Reset password
        </Button>
      </LifecyclePanelFooter>
    </div>
  );
}
