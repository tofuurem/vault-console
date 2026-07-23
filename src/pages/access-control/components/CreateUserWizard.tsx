import { useCallback, useMemo, useRef, useState } from 'react';

import Button from '@/components/base/Button';
import {
  resolveAccessSelection,
  resolveEffectiveKvTree,
  type EffectiveKvAccessTreeNode,
} from '@/domain/access-control/effective-access';
import { compileKvV2Policy, type LogicalKvAccessRule } from '@/domain/access-control/kv-v2-policy-compiler';
import { generateSecurePassword } from '@/domain/access-control/password';
import type { PolicySource } from '@/domain/access-control/types';
import AccessScreen from './create-user/AccessScreen';
import AccountForm from './create-user/AccountForm';
import type { AccessDraft } from './create-user/access';
import type { AccountDraft } from './create-user/account';
import { validateAccount } from './create-user/account';
import CreateUserWorkflowModal, {
  type CreateUserReview,
} from './create-user/CreateUserWorkflowModal';
import type { ApplyUser, WorkflowOperation } from './create-user/workflow';
import {
  CreateUserTransaction,
  createUserOperationPlan,
  type CreateUserTransactionInput,
} from '@/application/vault/createUserTransaction';
import type { AccessControlSnapshot } from '@/application/vault/useAccessControlData';
import type { VaultAccessControlGateway, VaultSession } from '@/domain/vault/contracts';
import { normalizeVaultError } from '@/domain/vault/errors';

interface CreateUserWizardProps {
  readonly onDone: () => void;
  readonly onCancel: () => void;
  readonly catalog: import('./create-user/access').CreateUserAccessCatalog;
  readonly snapshot: AccessControlSnapshot;
  readonly gateway: VaultAccessControlGateway;
  readonly session: VaultSession;
  readonly onSessionExpired?: () => void;
  readonly lazyKvTree?: boolean;
}

type DecisionStep = 'account' | 'access';

const EMPTY_ACCESS: AccessDraft = {
  selectedGroupIds: [],
  directRoleIds: [],
  directRules: [],
};

function flatten(nodes: readonly EffectiveKvAccessTreeNode[]): readonly EffectiveKvAccessTreeNode[] {
  return nodes.flatMap((node) => [node, ...flatten(node.children)]);
}

export default function CreateUserWizard({
  onDone,
  onCancel,
  catalog,
  snapshot,
  gateway,
  session,
  onSessionExpired,
  lazyKvTree = false,
}: CreateUserWizardProps) {
  const [step, setStep] = useState<DecisionStep>('account');
  const [account, setAccount] = useState<AccountDraft>(() => ({
    username: '',
    displayName: '',
    userpassMount: snapshot.userpassMounts[0]?.path ?? '',
    password: generateSecurePassword(),
  }));
  const [access, setAccess] = useState<AccessDraft>(EMPTY_ACCESS);
  const [showAccountErrors, setShowAccountErrors] = useState(false);
  const [workflowOpen, setWorkflowOpen] = useState(false);
  const transactionRef = useRef<CreateUserTransaction | null>(null);

  const directSource: PolicySource = useMemo(
    () => ({ kind: 'user-rule', id: `vc-user-${account.username || 'new-user'}`, label: 'Per-user rule' }),
    [account.username],
  );
  const logicalDirectRules: readonly LogicalKvAccessRule[] = useMemo(
    () => access.directRules.map((rule) => ({
      mount: rule.mount,
      path: rule.path,
      target: rule.target,
      level: rule.level,
      source: directSource,
    })),
    [access.directRules, directSource],
  );
  const selection = useMemo(
    () => resolveAccessSelection({
      groups: catalog.groups,
      roles: catalog.roles,
      policies: catalog.policies,
      selectedGroupIds: access.selectedGroupIds,
      directRoleIds: access.directRoleIds,
      directRules: logicalDirectRules,
    }),
    [access.directRoleIds, access.selectedGroupIds, catalog, logicalDirectRules],
  );
  const effectiveTree = useMemo(
    () => resolveEffectiveKvTree(catalog.tree, selection.rules),
    [catalog.tree, selection.rules],
  );
  const generatedHcl = useMemo(
    () => compileKvV2Policy(logicalDirectRules).hcl,
    [logicalDirectRules],
  );
  const transactionInput: CreateUserTransactionInput = useMemo(() => ({
    username: account.username,
    displayName: account.displayName,
    userpassMount: account.userpassMount,
    password: account.password,
    directRolePolicyNames: selection.directRoleIds,
    directPolicy: generatedHcl ? { name: `vc-user-${account.username}`, hcl: generatedHcl } : undefined,
    groups: selection.groupIds.flatMap((id) => {
      const group = snapshot.groups.find((candidate) => candidate.id === id);
      return group ? [group] : [];
    }),
  }), [account, generatedHcl, selection.directRoleIds, selection.groupIds, snapshot.groups]);
  const operationPlan: readonly Omit<WorkflowOperation, 'state'>[] = useMemo(
    () => createUserOperationPlan(transactionInput),
    [transactionInput],
  );

  const groupNames = selection.groupIds.map(
    (id) => catalog.groups.find((group) => group.id === id)?.name ?? id,
  );
  const inheritedRoleNames = selection.inheritedRoleIds.map(
    (id) => catalog.roles.find((role) => role.id === id)?.name ?? id,
  );
  const directRoleNames = selection.directRoleIds.map(
    (id) => catalog.roles.find((role) => role.id === id)?.name ?? id,
  );
  const dangerous =
    flatten(effectiveTree).some((node) => node.level === 'owner') ||
    access.directRules.some((rule) => rule.target === 'folder' && rule.path === '' && rule.level !== 'deny');
  const review: CreateUserReview = {
    username: account.username,
    displayName: account.displayName,
    userpassMount: account.userpassMount,
    password: account.password,
    groupNames,
    inheritedRoleNames,
    directRoleNames,
    directRules: access.directRules,
    generatedHcl,
    dangerous,
  };

  const applyUser: ApplyUser = useCallback(
    async (context) => {
      try {
        if (!transactionRef.current) {
          transactionRef.current = new CreateUserTransaction(gateway, session, snapshot, transactionInput);
        }
        await transactionRef.current.apply(context);
      } catch (cause) {
        const error = normalizeVaultError(cause);
        if (error.code === 'session-expired') onSessionExpired?.();
        throw error;
      }
    },
    [gateway, onSessionExpired, session, snapshot, transactionInput],
  );
  const rollbackUser: ApplyUser = useCallback(
    async (context) => {
      if (!transactionRef.current) return;
      await transactionRef.current.rollback(context);
    },
    [],
  );

  const goToAccess = () => {
    const validation = validateAccount(account);
    if (Object.keys(validation).length > 0) {
      setShowAccountErrors(true);
      return;
    }
    setShowAccountErrors(false);
    setStep('access');
  };
  const cancel = () => {
    setAccount((current) => ({ ...current, password: '' }));
    onCancel();
  };
  const complete = () => {
    setWorkflowOpen(false);
    setAccount((current) => ({ ...current, password: '' }));
    onDone();
  };
  const openWorkflow = () => {
    transactionRef.current = new CreateUserTransaction(gateway, session, snapshot, transactionInput);
    setWorkflowOpen(true);
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col bg-background-50">
      <header className="shrink-0 border-b border-background-200 bg-background-50 px-5 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={cancel}
              aria-label="Cancel user creation"
              className="flex h-7 w-7 items-center justify-center rounded-md text-foreground-400 hover:bg-background-100 hover:text-foreground-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-400"
            >
              <i className="ri-arrow-left-line" aria-hidden="true" />
            </button>
            <div>
              <h1 className="text-sm font-semibold text-foreground-900">Create user</h1>
              <p className="mt-0.5 text-[10px] text-foreground-400">Userpass account · identity · effective KV access</p>
            </div>
          </div>

          <ol aria-label="Create user steps" className="flex items-center gap-1.5">
            <li className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${step === 'account' ? 'border-primary-300 bg-primary-500 text-white' : 'border-emerald-200 bg-emerald-50 text-emerald-700'}`}>
              {step === 'access' ? <i className="ri-check-line" aria-hidden="true" /> : <span className="font-mono text-[9px]">01</span>}
              Account
            </li>
            <li role="presentation" className="h-px w-5 bg-background-300" aria-hidden="true" />
            <li className={`flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-semibold ${step === 'access' ? 'border-primary-300 bg-primary-500 text-white' : 'border-background-200 bg-background-100 text-foreground-400'}`}>
              <span className="font-mono text-[9px]">02</span> Access
            </li>
          </ol>
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {step === 'account' ? (
          <AccountForm
            value={account}
            onChange={setAccount}
            onRegeneratePassword={() => setAccount((current) => ({ ...current, password: generateSecurePassword() }))}
            userpassMounts={snapshot.userpassMounts}
            showErrors={showAccountErrors}
          />
        ) : (
          <AccessScreen
            username={account.username}
            catalog={catalog}
            value={access}
            onChange={setAccess}
            lazyTreeSession={lazyKvTree ? session : undefined}
          />
        )}
      </div>

      <footer className="flex shrink-0 items-center justify-between border-t border-background-200 bg-background-50 px-5 py-3">
        <div>
          {step === 'access' && (
            <Button type="button" variant="secondary" size="sm" onClick={() => setStep('account')}>
              <i className="ri-arrow-left-line" aria-hidden="true" /> Back
            </Button>
          )}
        </div>
        {step === 'account' ? (
          <Button type="button" variant="primary" size="sm" onClick={goToAccess}>
            Continue to access <i className="ri-arrow-right-line" aria-hidden="true" />
          </Button>
        ) : (
          <Button type="button" variant="primary" size="sm" onClick={openWorkflow}>
            Review & create <i className="ri-arrow-right-up-line" aria-hidden="true" />
          </Button>
        )}
      </footer>

      <CreateUserWorkflowModal
        open={workflowOpen}
        review={review}
        operationPlan={operationPlan}
        applyUser={applyUser}
        rollbackUser={rollbackUser}
        onClose={() => setWorkflowOpen(false)}
        onComplete={complete}
      />
    </div>
  );
}
