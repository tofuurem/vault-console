import { parseManagedPolicyHcl } from './managed-resources';

export const ROLE_POLICY_PREFIX = 'vc-role-';
export const USER_POLICY_PREFIX = 'vc-user-';
export const POLICY_OWNERSHIP_PREFIX = '# vault-console: ';

export type ManagedPolicyOwnershipKind = 'role' | 'user-direct';
export type PolicyOwnershipState = 'managed' | 'unverified' | 'external';

export interface ManagedRolePolicyHeader {
  readonly schema: 1;
  readonly kind: 'role';
  readonly description?: string;
}

export interface ManagedUserPolicyHeader {
  readonly schema: 1;
  readonly kind: 'user-direct';
  readonly owner: string;
}

export type ManagedPolicyOwnershipHeader =
  | ManagedRolePolicyHeader
  | ManagedUserPolicyHeader;

export type ManagedPolicyHeaderInput =
  | Omit<ManagedRolePolicyHeader, 'schema'>
  | Omit<ManagedUserPolicyHeader, 'schema'>;

export interface PolicyOwnershipAssessment {
  readonly state: PolicyOwnershipState;
  readonly kind: ManagedPolicyOwnershipKind | 'external';
  readonly header: ManagedPolicyOwnershipHeader | null;
  readonly editable: boolean;
}

function ownKeys(value: Record<string, unknown>): readonly string[] {
  return Object.keys(value).sort();
}

function hasOnlyKeys(value: Record<string, unknown>, expected: readonly string[]): boolean {
  const actual = ownKeys(value);
  const allowed = [...expected].sort();
  return actual.length === allowed.length
    && actual.every((key, index) => key === allowed[index]);
}

export function managedPolicyHeader(input: ManagedPolicyHeaderInput): string {
  const metadata: ManagedPolicyOwnershipHeader = input.kind === 'role'
    ? {
        schema: 1,
        kind: 'role',
        ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      }
    : {
        schema: 1,
        kind: 'user-direct',
        owner: input.owner,
      };
  return `${POLICY_OWNERSHIP_PREFIX}${JSON.stringify(metadata)}`;
}

export function renderManagedPolicy(input: ManagedPolicyHeaderInput, hcl: string): string {
  return `${managedPolicyHeader(input)}\n\n${hcl.trim()}`;
}

export function parseManagedPolicyHeader(hcl: string): ManagedPolicyOwnershipHeader | null {
  const firstLine = hcl.split(/\r?\n/, 1)[0];
  if (!firstLine.startsWith(POLICY_OWNERSHIP_PREFIX)) return null;

  let value: unknown;
  try {
    value = JSON.parse(firstLine.slice(POLICY_OWNERSHIP_PREFIX.length));
  } catch {
    return null;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.schema !== 1) return null;

  if (record.kind === 'role') {
    const keys = record.description === undefined
      ? ['schema', 'kind']
      : ['schema', 'kind', 'description'];
    if (!hasOnlyKeys(record, keys)) return null;
    if (record.description !== undefined && typeof record.description !== 'string') return null;
    const description = typeof record.description === 'string'
      ? record.description.trim()
      : '';
    return {
      schema: 1,
      kind: 'role',
      ...(description
        ? { description }
        : {}),
    };
  }

  if (record.kind === 'user-direct') {
    if (!hasOnlyKeys(record, ['schema', 'kind', 'owner'])) return null;
    if (typeof record.owner !== 'string' || record.owner.trim().length === 0) return null;
    return { schema: 1, kind: 'user-direct', owner: record.owner };
  }

  return null;
}

function kindFromName(name: string): ManagedPolicyOwnershipKind | 'external' {
  if (name.startsWith(ROLE_POLICY_PREFIX)) return 'role';
  if (name.startsWith(USER_POLICY_PREFIX)) return 'user-direct';
  return 'external';
}

export function assessPolicyOwnership(name: string, hcl: string): PolicyOwnershipAssessment {
  const kind = kindFromName(name);
  const editable = kind !== 'external' && parseManagedPolicyHcl(hcl) !== null;
  if (kind === 'external') {
    return { state: 'external', kind, header: null, editable: false };
  }

  const header = parseManagedPolicyHeader(hcl);
  const matchingHeader = header?.kind === kind;
  return {
    state: matchingHeader ? 'managed' : 'unverified',
    kind,
    header,
    editable,
  };
}
