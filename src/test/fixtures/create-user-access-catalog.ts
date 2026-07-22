import type { AccessPolicyRule, KvAccessTreeNode } from '@/domain/access-control/effective-access';
import { compileKvV2Rule } from '@/domain/access-control/kv-v2-policy-compiler';
import type { KvPermissionLevel } from '@/domain/access-control/permission-presets';
import type { PolicySource } from '@/domain/access-control/types';
import type { CreateUserAccessCatalog } from '@/pages/access-control/components/create-user/access';

const source: PolicySource = { kind: 'policy', id: 'fixture-catalog', label: 'Test fixture' };

function policyRules(
  rules: readonly {
    mount: string;
    path: string;
    level: Exclude<KvPermissionLevel, 'inherited' | 'deny'>;
  }[],
): readonly AccessPolicyRule[] {
  return rules.flatMap((rule) =>
    compileKvV2Rule({ ...rule, target: 'folder', source }).map(({ pattern, capabilities }) => ({
      pattern,
      capabilities,
    })),
  );
}

const applicationsTree: KvAccessTreeNode = {
  id: 'applications:',
  label: 'applications',
  mount: 'applications',
  path: '',
  target: 'folder',
  children: [
    {
      id: 'applications:billing',
      label: 'billing',
      mount: 'applications',
      path: 'billing',
      target: 'folder',
      children: [
        { id: 'applications:billing/production', label: 'production', mount: 'applications', path: 'billing/production', target: 'folder' },
        { id: 'applications:billing/staging', label: 'staging', mount: 'applications', path: 'billing/staging', target: 'folder' },
      ],
    },
    {
      id: 'applications:payments',
      label: 'payments',
      mount: 'applications',
      path: 'payments',
      target: 'folder',
      children: [
        { id: 'applications:payments/production', label: 'production', mount: 'applications', path: 'payments/production', target: 'folder' },
      ],
    },
  ],
};

const platformTree: KvAccessTreeNode = {
  id: 'platform:',
  label: 'platform',
  mount: 'platform',
  path: '',
  target: 'folder',
  children: [
    {
      id: 'platform:infrastructure',
      label: 'infrastructure',
      mount: 'platform',
      path: 'infrastructure',
      target: 'folder',
      children: [
        { id: 'platform:infrastructure/postgres', label: 'postgres', mount: 'platform', path: 'infrastructure/postgres', target: 'folder' },
        { id: 'platform:infrastructure/redis', label: 'redis', mount: 'platform', path: 'infrastructure/redis', target: 'folder' },
        { id: 'platform:infrastructure/kafka', label: 'kafka', mount: 'platform', path: 'infrastructure/kafka', target: 'folder' },
      ],
    },
    {
      id: 'platform:shared',
      label: 'shared',
      mount: 'platform',
      path: 'shared',
      target: 'folder',
      children: [
        { id: 'platform:shared/monitoring', label: 'monitoring', mount: 'platform', path: 'shared/monitoring', target: 'folder' },
        { id: 'platform:shared/logging', label: 'logging', mount: 'platform', path: 'shared/logging', target: 'folder' },
      ],
    },
  ],
};

export const createUserAccessCatalogFixture: CreateUserAccessCatalog = {
  groups: [
    { id: 'platform-team', name: 'platform-team', roleIds: ['platform-readers'], policyNames: [] },
    { id: 'billing-team', name: 'billing-team', roleIds: ['billing-editors'], policyNames: [] },
    { id: 'dba-team', name: 'dba-team', roleIds: ['dba-owners'], policyNames: [] },
    { id: 'sre-observability', name: 'sre-observability', roleIds: ['sre-monitoring'], policyNames: [] },
  ],
  roles: [
    { id: 'platform-readers', name: 'Platform readers', policyNames: ['vc-role-platform-readers'] },
    { id: 'billing-editors', name: 'Billing editors', policyNames: ['vc-role-billing-editors'] },
    { id: 'dba-owners', name: 'DBA owners', policyNames: ['vc-role-dba-owners'] },
    { id: 'sre-monitoring', name: 'SRE monitoring', policyNames: ['vc-role-sre-monitoring'] },
  ],
  policies: [
    {
      name: 'vc-role-platform-readers',
      managed: true,
      rules: policyRules([{ mount: 'platform', path: '', level: 'view' }]),
    },
    {
      name: 'vc-role-billing-editors',
      managed: true,
      rules: policyRules([{ mount: 'applications', path: 'billing', level: 'edit' }]),
    },
    {
      name: 'vc-role-dba-owners',
      managed: true,
      rules: policyRules([
        { mount: 'platform', path: 'infrastructure/postgres', level: 'owner' },
        { mount: 'platform', path: 'infrastructure/redis', level: 'owner' },
      ]),
    },
    {
      name: 'vc-role-sre-monitoring',
      managed: true,
      rules: policyRules([
        { mount: 'platform', path: 'shared/monitoring', level: 'manage-versions' },
        { mount: 'platform', path: 'shared/logging', level: 'manage-versions' },
      ]),
    },
  ],
  tree: [applicationsTree, platformTree],
};
