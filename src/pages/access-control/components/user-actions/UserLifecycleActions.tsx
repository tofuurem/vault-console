import type { UserLifecycleRef } from '@/application/vault/access-lifecycle/user-lifecycle';
import Button from '@/components/base/Button';
import Modal from '@/components/base/Modal';
import type {
  VaultAccessControlGateway,
  VaultSession,
} from '@/domain/vault/contracts';
import PasswordHandoff from '../create-user/PasswordHandoff';
import LifecycleActionMenu from './LifecycleActionMenu';
import {
  RemoveLoginPanel,
  ToggleIdentityPanel,
} from './LifecyclePlanPanels';
import ResetPasswordPanel from './ResetPasswordPanel';
import {
  useUserLifecycleActions,
  type ActionPanel,
} from './useUserLifecycleActions';

function panelTitle(panel: ActionPanel | undefined, entityDisabled: boolean): string {
  switch (panel) {
    case 'password':
    case 'password-success':
      return 'Reset userpass password';
    case 'toggle':
      return entityDisabled ? 'Enable Identity' : 'Disable Identity';
    case 'remove':
      return 'Disable and remove login';
    default:
      return 'Account lifecycle actions';
  }
}

interface UserLifecycleActionsProps {
  readonly reference: UserLifecycleRef;
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly onChanged: () => void;
  readonly onRemoved: (tombstoneEntityId?: string) => void;
  readonly onSessionExpired?: () => void;
}

export default function UserLifecycleActions(props: UserLifecycleActionsProps) {
  const { reference } = props;
  const actions = useUserLifecycleActions(props);
  const {
    panel,
    snapshot,
    togglePlan,
    removal,
    confirmation,
    setConfirmation,
    result,
    applying,
  } = actions;
  const entityDisabled = Boolean(snapshot?.entity?.disabled);

  return (
    <>
      <Button
        type="button"
        size="sm"
        onClick={() => actions.setPanel('menu')}
        aria-label="Open account lifecycle actions"
      >
        <i className="ri-shield-user-line" aria-hidden="true" />
        <span className="hidden xl:inline">Account actions</span>
      </Button>
      <Modal
        open={Boolean(panel)}
        onClose={actions.close}
        title={panelTitle(panel, entityDisabled)}
        width={panel === 'remove' ? 'xl' : 'lg'}
      >
        {panel === 'menu' && (
          <LifecycleActionMenu
            reference={reference}
            snapshotFailed={actions.snapshotQuery.isError}
            capabilitiesPending={actions.capabilitiesPending}
            resetAllowed={actions.resetAllowed}
            toggleAllowed={actions.toggleAllowed}
            removalAllowed={actions.removalAllowed}
            hasTogglePlan={Boolean(togglePlan)}
            entityDisabled={entityDisabled}
            removalMode={removal?.mode}
            onOpenPassword={actions.openPassword}
            onOpenToggle={() => actions.openPanel('toggle')}
            onOpenRemove={() => actions.openPanel('remove')}
          />
        )}

        {panel === 'password' && snapshot && (
          <ResetPasswordPanel
            password={actions.password}
            passwordMode={actions.passwordMode}
            result={result}
            applying={applying}
            resetAllowed={actions.resetAllowed}
            onModeChange={actions.selectPasswordMode}
            onPasswordChange={actions.setPassword}
            onRegenerate={actions.regeneratePassword}
            onBack={actions.backToMenu}
            onSubmit={() => { void actions.resetPassword(); }}
          />
        )}

        {panel === 'password-success' && (
          <PasswordHandoff
            username={reference.username}
            password={actions.password}
            userpassMount={reference.mount}
            successTitle="Password reset successfully"
            successDescription="Vault confirmed the specialized password update."
            passwordLabel="Reset user password"
            onFinish={actions.close}
          />
        )}

        {panel === 'toggle' && snapshot?.entity && togglePlan && (
          <ToggleIdentityPanel
            entityDisabled={snapshot.entity.disabled}
            plan={togglePlan}
            confirmation={confirmation}
            onConfirmationChange={setConfirmation}
            result={result}
            applying={applying}
            allowed={actions.toggleAllowed}
            onBack={actions.backToMenu}
            onSubmit={() => { void actions.toggleIdentity(); }}
          />
        )}

        {panel === 'remove' && removal && (
          <RemoveLoginPanel
            removal={removal}
            confirmation={confirmation}
            onConfirmationChange={setConfirmation}
            result={result}
            applying={applying}
            allowed={actions.removalAllowed}
            onBack={actions.backToMenu}
            onSubmit={() => { void actions.removeLogin(); }}
          />
        )}
      </Modal>
    </>
  );
}
