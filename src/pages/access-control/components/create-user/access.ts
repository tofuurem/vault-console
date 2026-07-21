import type {
  AccessGroup,
  AccessPolicy,
  AccessRole,
  KvAccessTreeNode,
} from '@/domain/access-control/effective-access';
import type { KvPermissionLevel } from '@/domain/access-control/permission-presets';

export interface DirectKvAccessRule {
  readonly nodeId: string;
  readonly mount: string;
  readonly path: string;
  readonly target: 'folder' | 'secret';
  readonly level: Exclude<KvPermissionLevel, 'inherited'>;
}

export interface AccessDraft {
  readonly selectedGroupIds: readonly string[];
  readonly directRoleIds: readonly string[];
  readonly directRules: readonly DirectKvAccessRule[];
}

export interface CreateUserAccessCatalog {
  readonly groups: readonly AccessGroup[];
  readonly roles: readonly AccessRole[];
  readonly policies: readonly AccessPolicy[];
  readonly tree: readonly KvAccessTreeNode[];
}
