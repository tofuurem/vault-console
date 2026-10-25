import Button from '@/components/base/Button';
import Modal from '@/components/base/Modal';
import type {
  ChangePlan,
  PlanExecutionResult,
} from '@/domain/access-control/lifecycle/model';
import AccessReview from './AccessReview';
import PlanExecutionNotice from './PlanExecutionNotice';

interface DeletePlanDialogProps {
  readonly open: boolean;
  readonly title: string;
  readonly plan: ChangePlan | undefined;
  readonly result: PlanExecutionResult | undefined;
  readonly deleting: boolean;
  readonly confirmation: string;
  readonly onConfirmationChange: (value: string) => void;
  readonly confirmLabel: string;
  readonly confirmDisabled?: boolean;
  readonly onClose: () => void;
  readonly onConfirm: () => Promise<void>;
}

export default function DeletePlanDialog({
  open,
  title,
  plan,
  result,
  deleting,
  confirmation,
  onConfirmationChange,
  confirmLabel,
  confirmDisabled,
  onClose,
  onConfirm,
}: DeletePlanDialogProps) {
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!deleting) onClose();
      }}
      title={title}
      width="lg"
    >
      {plan && (
        <div className="space-y-4 p-4 sm:p-5">
          <AccessReview
            plan={plan}
            confirmation={confirmation}
            onConfirmationChange={onConfirmationChange}
          />
          <PlanExecutionNotice result={result} />
          <div className="flex justify-end gap-2 border-t border-background-200 pt-4">
            <Button type="button" size="sm" onClick={onClose} disabled={deleting}>
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="danger"
              loading={deleting}
              disabled={confirmDisabled}
              onClick={() => { void onConfirm(); }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      )}
    </Modal>
  );
}
