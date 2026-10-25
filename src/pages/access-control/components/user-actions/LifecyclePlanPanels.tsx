import type { UserRemovalPlan } from '@/application/vault/access-lifecycle/user-lifecycle';
import Button from '@/components/base/Button';
import type {
  ChangePlan,
  PlanExecutionResult,
} from '@/domain/access-control/lifecycle/model';
import AccessReview from '../workspace/AccessReview';
import PlanExecutionNotice from '../workspace/PlanExecutionNotice';
import LifecyclePanelFooter from './LifecyclePanelFooter';

interface PlanPanelProps {
  readonly confirmation: string;
  readonly onConfirmationChange: (value: string) => void;
  readonly result: PlanExecutionResult | undefined;
  readonly applying: boolean;
  readonly allowed: boolean;
  readonly onBack: () => void;
  readonly onSubmit: () => void;
}

export function ToggleIdentityPanel({
  entityDisabled,
  plan,
  confirmation,
  onConfirmationChange,
  result,
  applying,
  allowed,
  onBack,
  onSubmit,
}: PlanPanelProps & {
  readonly entityDisabled: boolean;
  readonly plan: ChangePlan;
}) {
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className={`rounded-md border p-3 text-[10px] leading-4 ${
        entityDisabled
          ? 'border-primary-200 bg-primary-50 text-primary-800'
          : 'border-warning-300 bg-warning-50 text-warning-900'
      }`}>
        {entityDisabled
          ? 'Enable removes the Identity block. It does not recreate a deleted userpass login or change policies.'
          : 'Disable blocks identity-associated tokens on their next request. Tokens are blocked, not revoked, and the userpass login remains present.'}
      </div>
      <AccessReview
        plan={plan}
        confirmation={confirmation}
        onConfirmationChange={onConfirmationChange}
      />
      <PlanExecutionNotice result={result} />
      <LifecyclePanelFooter applying={applying} onBack={onBack}>
        <Button
          type="button"
          size="sm"
          variant={entityDisabled ? 'primary' : 'danger'}
          loading={applying}
          disabled={!allowed}
          onClick={onSubmit}
        >
          {entityDisabled ? 'Enable Identity' : 'Disable Identity'}
        </Button>
      </LifecyclePanelFooter>
    </div>
  );
}

export function RemoveLoginPanel({
  removal,
  confirmation,
  onConfirmationChange,
  result,
  applying,
  allowed,
  onBack,
  onSubmit,
}: PlanPanelProps & {
  readonly removal: UserRemovalPlan;
}) {
  const managed = removal.mode === 'managed-tombstone';
  return (
    <div className="space-y-4 p-4 sm:p-5">
      <div className="rounded-md border border-danger-300 bg-danger-50 p-3 text-[10px] leading-4 text-danger-900">
        <p className="font-semibold">
          {managed
            ? 'Managed removal retains a disabled Identity tombstone'
            : 'Only the userpass login can be removed safely'}
        </p>
        <p className="mt-1">
          Deleting a login prevents future password logins but does not revoke issued
          tokens. Purge, when eligible, remains a separate advanced operation.
        </p>
        {removal.preservedReasons.length > 0 && (
          <ul className="mt-1 list-disc pl-4">
            {removal.preservedReasons.map((reason) => <li key={reason}>{reason}</li>)}
          </ul>
        )}
      </div>
      <AccessReview
        plan={removal.plan}
        confirmation={confirmation}
        onConfirmationChange={onConfirmationChange}
      />
      <PlanExecutionNotice result={result} />
      <LifecyclePanelFooter applying={applying} onBack={onBack}>
        <Button
          type="button"
          size="sm"
          variant="danger"
          loading={applying}
          disabled={
            !allowed
            || confirmation !== removal.plan.confirmation?.value
          }
          onClick={onSubmit}
        >
          {managed
            ? 'Disable and remove login'
            : 'Remove login only'}
        </Button>
      </LifecyclePanelFooter>
    </div>
  );
}
