import Button from '@/components/base/Button';
import type {
  UserLifecycleRef,
  UserRemovalPlan,
} from '@/application/vault/access-lifecycle/user-lifecycle';

function ActionChoice({
  icon,
  title,
  description,
  tone = 'normal',
  disabled,
  disabledReason,
  onClick,
}: {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
  readonly tone?: 'normal' | 'danger';
  readonly disabled?: boolean;
  readonly disabledReason?: string;
  readonly onClick: () => void;
}) {
  return (
    <div className="rounded-lg border border-background-300 bg-background-50 p-3">
      <div className="flex items-start gap-3">
        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
          tone === 'danger'
            ? 'bg-danger-100 text-danger-700'
            : 'bg-primary-100 text-primary-700'
        }`}>
          <i className={icon} aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold text-foreground-900">{title}</p>
          <p className="mt-0.5 text-[10px] leading-4 text-foreground-500">{description}</p>
          {disabled && disabledReason && (
            <p className="mt-1 text-[10px] leading-4 text-warning-700">{disabledReason}</p>
          )}
        </div>
        <Button
          type="button"
          size="sm"
          variant={tone === 'danger' ? 'danger' : 'secondary'}
          disabled={disabled}
          onClick={onClick}
        >
          Open
        </Button>
      </div>
    </div>
  );
}

function toggleDisabledReason(hasPlan: boolean, pending: boolean): string {
  if (!hasPlan) return 'A linked Vault Console-managed Identity entity is required.';
  if (pending) return 'Checking the exact Identity capability.';
  return 'This token cannot update the linked Identity entity.';
}

interface LifecycleActionMenuProps {
  readonly reference: UserLifecycleRef;
  readonly snapshotFailed: boolean;
  readonly capabilitiesPending: boolean;
  readonly resetAllowed: boolean;
  readonly toggleAllowed: boolean;
  readonly removalAllowed: boolean;
  readonly hasTogglePlan: boolean;
  readonly entityDisabled: boolean;
  readonly removalMode: UserRemovalPlan['mode'] | undefined;
  readonly onOpenPassword: () => void;
  readonly onOpenToggle: () => void;
  readonly onOpenRemove: () => void;
}

export default function LifecycleActionMenu({
  reference,
  snapshotFailed,
  capabilitiesPending,
  resetAllowed,
  toggleAllowed,
  removalAllowed,
  hasTogglePlan,
  entityDisabled,
  removalMode,
  onOpenPassword,
  onOpenToggle,
  onOpenRemove,
}: LifecycleActionMenuProps) {
  return (
    <div className="space-y-3 p-4 sm:p-5">
      <div className="rounded-md border border-background-200 bg-background-100 px-3 py-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-foreground-400">
          auth/{reference.mount}/users/{reference.username}
        </p>
        <p className="mt-1 text-[10px] leading-4 text-foreground-600">
          These operations change login or Identity state. Existing-token behavior is
          stated separately for each action.
        </p>
      </div>
      {snapshotFailed && (
        <div role="alert" className="rounded-md border border-warning-300 bg-warning-50 p-3 text-xs text-warning-900">
          Lifecycle dependencies could not be loaded. Retry the profile before changing it.
        </div>
      )}
      <ActionChoice
        icon="ri-key-2-line"
        title="Reset password"
        description="Replaces the password for future logins. Already issued tokens remain valid."
        disabled={capabilitiesPending || !resetAllowed}
        disabledReason={capabilitiesPending
          ? 'Checking the exact Vault path capability.'
          : 'This token cannot update the userpass password path.'}
        onClick={onOpenPassword}
      />
      <ActionChoice
        icon={entityDisabled ? 'ri-play-circle-line' : 'ri-forbid-2-line'}
        title={entityDisabled ? 'Enable Identity' : 'Disable Identity'}
        description={entityDisabled
          ? 'Allows identity-associated tokens to be used again; it does not create a login.'
          : 'Blocks identity-associated tokens immediately without deleting or revoking them.'}
        disabled={capabilitiesPending || !toggleAllowed}
        disabledReason={toggleDisabledReason(hasTogglePlan, capabilitiesPending)}
        onClick={onOpenToggle}
      />
      <ActionChoice
        icon="ri-user-unfollow-line"
        title={removalMode === 'managed-tombstone'
          ? 'Disable and remove login'
          : 'Remove login only'}
        description="Deletes the userpass login. Existing tokens are not revoked; managed identities retain a disabled tombstone."
        tone="danger"
        disabled={capabilitiesPending || !removalAllowed}
        disabledReason={capabilitiesPending
          ? 'Checking every Vault path in the removal plan.'
          : 'This token is missing at least one capability required by the safe plan.'}
        onClick={onOpenRemove}
      />
    </div>
  );
}
