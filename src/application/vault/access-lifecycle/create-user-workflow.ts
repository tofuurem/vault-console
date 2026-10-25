/**
 * Progress contract for creating a user. Creation is a saga rather than a
 * ChangePlan: later steps depend on identifiers returned by earlier ones
 * (the alias needs the new entity ID), and a failure compensates every
 * resource created so far instead of only newly written policies.
 */
export type OperationState =
  | 'pending'
  | 'running'
  | 'completed'
  | 'failed'
  | 'compensating'
  | 'compensated'
  | 'compensation-failed';

export interface WorkflowOperation {
  readonly id: string;
  readonly label: string;
  readonly state: OperationState;
}

export interface ApplyProgressReporter {
  (operationId: string, state: OperationState): void;
}

export interface ApplyUserContext {
  readonly report: ApplyProgressReporter;
  readonly signal: AbortSignal;
}

export type ApplyUser = (context: ApplyUserContext) => Promise<void>;
