import type {
  OperationState,
  WorkflowOperation,
} from '@/application/vault/access-lifecycle/create-user-workflow';

export type {
  ApplyUser,
  ApplyUserContext,
  OperationState,
  WorkflowOperation,
} from '@/application/vault/access-lifecycle/create-user-workflow';

export type CreateUserWorkflowStage = 'closed' | 'confirmation' | 'applying' | 'failure' | 'success';

export interface CreateUserWorkflowState {
  readonly stage: CreateUserWorkflowStage;
  readonly operations: readonly WorkflowOperation[];
  readonly error?: string;
}

export type CreateUserWorkflowAction =
  | { readonly type: 'open'; readonly operations: readonly Omit<WorkflowOperation, 'state'>[] }
  | { readonly type: 'close' }
  | { readonly type: 'start' }
  | { readonly type: 'operation'; readonly id: string; readonly state: OperationState }
  | { readonly type: 'failure'; readonly error: string }
  | { readonly type: 'success' };

export const CLOSED_WORKFLOW: CreateUserWorkflowState = { stage: 'closed', operations: [] };

export function createUserWorkflowReducer(
  state: CreateUserWorkflowState,
  action: CreateUserWorkflowAction,
): CreateUserWorkflowState {
  switch (action.type) {
    case 'open':
      return {
        stage: 'confirmation',
        operations: action.operations.map((operation) => ({ ...operation, state: 'pending' })),
      };
    case 'close':
      return CLOSED_WORKFLOW;
    case 'start':
      return { ...state, stage: 'applying', error: undefined };
    case 'operation':
      return {
        ...state,
        operations: state.operations.map((operation) =>
          operation.id === action.id ? { ...operation, state: action.state } : operation,
        ),
      };
    case 'failure':
      return { ...state, stage: 'failure', error: action.error };
    case 'success':
      return { ...state, stage: 'success', error: undefined };
  }
}
