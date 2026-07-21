import { useEffect, useReducer, useRef } from 'react';

import Button from '@/components/base/Button';
import Modal from '@/components/base/Modal';
import type { DirectKvAccessRule } from './access';
import ApplyProgress from './ApplyProgress';
import CreateUserConfirmation from './CreateUserConfirmation';
import PasswordHandoff from './PasswordHandoff';
import {
  CLOSED_WORKFLOW,
  createUserWorkflowReducer,
  type ApplyUser,
  type WorkflowOperation,
} from './workflow';

export interface CreateUserReview {
  readonly username: string;
  readonly displayName: string;
  readonly userpassMount: string;
  readonly password: string;
  readonly groupNames: readonly string[];
  readonly inheritedRoleNames: readonly string[];
  readonly directRoleNames: readonly string[];
  readonly directRules: readonly DirectKvAccessRule[];
  readonly generatedHcl: string;
  readonly dangerous: boolean;
}

interface CreateUserWorkflowModalProps {
  readonly open: boolean;
  readonly review: CreateUserReview;
  readonly operationPlan: readonly Omit<WorkflowOperation, 'state'>[];
  readonly applyUser: ApplyUser;
  readonly rollbackUser?: ApplyUser;
  readonly onClose: () => void;
  readonly onComplete: () => void;
}

const SAFE_FAILURE_MESSAGE = 'Vault stopped the operation. Review the completed steps, then retry or roll back the objects created by this attempt.';

export default function CreateUserWorkflowModal({
  open,
  review,
  operationPlan,
  applyUser,
  rollbackUser,
  onClose,
  onComplete,
}: CreateUserWorkflowModalProps) {
  const [state, dispatch] = useReducer(createUserWorkflowReducer, CLOSED_WORKFLOW);
  const abortController = useRef<AbortController | null>(null);
  const operationPlanRef = useRef(operationPlan);
  operationPlanRef.current = operationPlan;

  useEffect(() => {
    if (open) dispatch({ type: 'open', operations: operationPlanRef.current });
    else dispatch({ type: 'close' });
    return () => abortController.current?.abort();
  }, [open]);

  const report = (operationId: string, operationState: WorkflowOperation['state']) => {
    dispatch({ type: 'operation', id: operationId, state: operationState });
  };
  const runApply = async () => {
    dispatch({ type: 'start' });
    abortController.current = new AbortController();
    try {
      await applyUser({ report, signal: abortController.current.signal });
      dispatch({ type: 'success' });
    } catch {
      dispatch({ type: 'failure', error: SAFE_FAILURE_MESSAGE });
    }
  };
  const runRollback = async () => {
    if (!rollbackUser) return;
    abortController.current = new AbortController();
    try {
      await rollbackUser({ report, signal: abortController.current.signal });
    } catch {
      dispatch({ type: 'failure', error: 'Best-effort rollback could not restore every object. Review the operation list before continuing.' });
    }
  };
  const complete = () => {
    dispatch({ type: 'close' });
    onComplete();
  };
  const close = () => {
    if (state.stage === 'applying') return;
    if (state.stage === 'success') {
      complete();
      return;
    }
    abortController.current?.abort();
    dispatch({ type: 'close' });
    onClose();
  };

  const title = state.stage === 'confirmation'
    ? 'Confirm new user'
    : state.stage === 'success'
      ? 'Credential handoff'
      : state.stage === 'failure'
        ? 'Creation needs attention'
        : 'Creating Vault user';

  return (
    <Modal open={open && state.stage !== 'closed'} onClose={close} title={title} width="lg">
      {state.stage === 'confirmation' && (
        <CreateUserConfirmation
          {...review}
          passwordLength={review.password.length}
          operations={state.operations}
          onCancel={close}
          onConfirm={runApply}
        />
      )}
      {(state.stage === 'applying' || state.stage === 'failure') && (
        <>
          <ApplyProgress operations={state.operations} error={state.error} />
          {state.stage === 'failure' && (
            <div className="flex flex-wrap justify-end gap-2 border-t border-background-200 px-4 py-3 sm:px-5">
              <Button type="button" variant="secondary" onClick={close}>Close</Button>
              {rollbackUser && <Button type="button" variant="danger" onClick={runRollback}>Rollback completed changes</Button>}
              <Button type="button" variant="primary" onClick={runApply}>Retry from safe point</Button>
            </div>
          )}
        </>
      )}
      {state.stage === 'success' && (
        <PasswordHandoff
          username={review.username}
          password={review.password}
          userpassMount={review.userpassMount}
          onFinish={complete}
        />
      )}
    </Modal>
  );
}
