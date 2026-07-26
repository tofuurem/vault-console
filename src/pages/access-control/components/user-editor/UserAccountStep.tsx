import { Input } from '@/components/base/Input';
import type { UserLifecycleSnapshot } from '@/domain/access-control/lifecycle/model';
import type { UserEditorDraft } from './user-editor-draft';

function duration(seconds: number | undefined): string {
  if (seconds === undefined) return 'Vault default';
  if (seconds === 0) return 'Unlimited';
  if (seconds % 3600 === 0) return `${seconds / 3600}h`;
  if (seconds % 60 === 0) return `${seconds / 60}m`;
  return `${seconds}s`;
}

function Setting({
  label,
  value,
}: {
  readonly label: string;
  readonly value: string;
}) {
  return (
    <div className="rounded-md border border-background-200 bg-background-50 px-3 py-2.5">
      <dt className="font-mono text-[9px] uppercase tracking-[0.12em] text-foreground-400">
        {label}
      </dt>
      <dd className="mt-1 break-all font-mono text-[11px] font-semibold text-foreground-800">
        {value}
      </dd>
    </div>
  );
}

interface UserAccountStepProps {
  readonly snapshot: UserLifecycleSnapshot;
  readonly draft: UserEditorDraft;
  readonly displayNameError?: string;
  readonly onChange: (draft: UserEditorDraft) => void;
}

export default function UserAccountStep({
  snapshot,
  draft,
  displayNameError,
  onChange,
}: UserAccountStepProps) {
  const account = snapshot.account;
  const managedIdentity = snapshot.entity
    && snapshot.entity.metadata?.managed_by === 'vault-console';
  return (
    <div className="space-y-5">
      <div>
        <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.16em] text-primary-600">
          Account identity
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-foreground-950">
          Login and Identity
        </h2>
        <p className="mt-1 max-w-2xl text-xs leading-5 text-foreground-500">
          Username and auth mount are immutable in Vault. Advanced token settings are shown
          read-only in this release and are preserved by policy updates.
        </p>
      </div>

      <section className="grid gap-3 rounded-lg border border-background-300 bg-background-50 p-4 md:grid-cols-2">
        <Input
          id="user-display-name"
          label="Display name"
          value={draft.displayName}
          onChange={(event) => onChange({
            ...draft,
            displayName: event.target.value,
          })}
          disabled={!managedIdentity}
          autoComplete="off"
          error={displayNameError}
        />
        <div className="grid grid-cols-2 gap-2">
          <Setting label="Username" value={account.username} />
          <Setting label="Auth mount" value={`auth/${account.mount}`} />
        </div>
        {!managedIdentity && (
          <p className="md:col-span-2 rounded-md border border-warning-200 bg-warning-50 px-3 py-2 text-[10px] leading-4 text-warning-800">
            The linked Identity is external or unavailable. Vault Console preserves it and
            keeps the display name read-only.
          </p>
        )}
      </section>

      <section aria-labelledby="token-settings-heading">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="font-mono text-[9px] font-semibold uppercase tracking-[0.14em] text-foreground-400">
              Read-only
            </p>
            <h3 id="token-settings-heading" className="mt-0.5 text-sm font-semibold text-foreground-900">
              Userpass token settings
            </h3>
          </div>
          <span className="rounded-sm border border-background-300 bg-background-100 px-2 py-1 font-mono text-[9px] text-foreground-500">
            preserved exactly
          </span>
        </div>
        <dl className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Setting label="Token TTL" value={duration(account.tokenTtlSeconds)} />
          <Setting label="Max TTL" value={duration(account.tokenMaxTtlSeconds)} />
          <Setting label="Explicit max TTL" value={duration(account.tokenExplicitMaxTtlSeconds)} />
          <Setting label="Period" value={duration(account.tokenPeriodSeconds)} />
          <Setting label="Token type" value={account.tokenType ?? 'Vault default'} />
          <Setting label="Number of uses" value={String(account.tokenNumUses ?? 0)} />
          <Setting
            label="Bound CIDRs"
            value={account.tokenBoundCidrs?.join(', ') || 'Any address'}
          />
          <Setting
            label="Default policy"
            value={account.tokenNoDefaultPolicy ? 'Disabled' : 'Enabled'}
          />
        </dl>
      </section>
    </div>
  );
}
