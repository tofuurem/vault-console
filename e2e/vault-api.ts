import type { Page, Route } from '@playwright/test';

export interface MockVaultState {
  accountCreates: number;
  entityCreates: number;
  aliasAttempts: number;
  groupUpdates: number;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': 'http://127.0.0.1:43173',
  'Access-Control-Allow-Headers': 'Content-Type, X-Vault-Token, X-Vault-Request',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
};

async function json(route: Route, body: unknown, status = 200) {
  await route.fulfill({
    status,
    contentType: 'application/json',
    headers: corsHeaders,
    body: JSON.stringify(body),
  });
}

export async function mockVaultApi(page: Page, options: { failAliasOnce?: boolean } = {}) {
  const state: MockVaultState = { accountCreates: 0, entityCreates: 0, aliasAttempts: 0, groupUpdates: 0 };
  await page.route('http://vault.test:8200/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace(/^\/v1\//, '').replace(/\/$/, '');
    const method = request.method();
    if (method === 'OPTIONS') {
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (path === 'sys/health') {
      await json(route, { initialized: true, sealed: false, standby: false, version: '1.20.4' });
      return;
    }
    if (path === 'auth/token/lookup-self') {
      await json(route, { data: { display_name: 'e2e-operator', expire_time: null } });
      return;
    }
    if (path === 'sys/capabilities-self') {
      const body = request.postDataJSON() as { paths: string[] };
      await json(route, Object.fromEntries(body.paths.map((candidate) => [candidate, ['create', 'read', 'update', 'delete', 'list']])), 200);
      return;
    }
    if (path === 'sys/internal/ui/mounts') {
      await json(route, { data: { 'applications/': { type: 'kv', accessor: 'kv_apps', description: 'Application secrets', options: { version: '2' } } } });
      return;
    }
    if (path === 'applications/metadata' && url.searchParams.get('list') === 'true') {
      await json(route, { data: { keys: ['platform/', 'shared'] } });
      return;
    }
    if (path === 'applications/metadata/platform' && url.searchParams.get('list') === 'true') {
      await json(route, { data: { keys: ['api'] } });
      return;
    }
    if (path === 'applications/metadata/shared') {
      await json(route, { data: { current_version: 2, oldest_version: 1, custom_metadata: {}, versions: {
        '1': { created_time: '2026-07-20T12:00:00Z', destroyed: false, deletion_time: '' },
        '2': { created_time: '2026-07-21T12:00:00Z', destroyed: false, deletion_time: '' },
      } } });
      return;
    }
    if (path === 'applications/data/shared') {
      await json(route, { data: { data: { API_KEY: 'masked-in-browser-test' }, metadata: { created_time: '2026-07-21T12:00:00Z', version: 2, custom_metadata: null, destroyed: false, deletion_time: '' } } });
      return;
    }
    if (path === 'sys/auth') {
      await json(route, { data: { 'userpass/': { accessor: 'auth_userpass_123', type: 'userpass', description: 'People' } } });
      return;
    }
    if (path === 'sys/policy') {
      await json(route, { policies: ['default', 'vc-role-platform-readers', 'legacy-operator'] });
      return;
    }
    if (path.startsWith('sys/policy/')) {
      const name = decodeURIComponent(path.slice('sys/policy/'.length));
      const role = [
        'path "applications/data/*" { capabilities = ["read"] }',
        'path "applications/metadata" { capabilities = ["read", "list"] }',
        'path "applications/metadata/*" { capabilities = ["read", "list"] }',
      ].join('\n');
      await json(route, { name, rules: name === 'vc-role-platform-readers' ? role : 'path "sys/health" { capabilities = ["read"] }' });
      return;
    }
    if (path === 'identity/group/id' && url.searchParams.get('list') === 'true') {
      await json(route, { data: { keys: ['group-platform'] } });
      return;
    }
    if (path === 'identity/group/id/group-platform' && method === 'GET') {
      await json(route, { data: { id: 'group-platform', name: 'platform-team', type: 'internal', policies: ['vc-role-platform-readers'], member_entity_ids: ['entity-alice'], member_group_ids: [], metadata: {} } });
      return;
    }
    if (path === 'identity/group/id/group-platform' && method === 'POST') {
      state.groupUpdates += 1;
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (path === 'auth/userpass/users' && url.searchParams.get('list') === 'true') {
      await json(route, { data: { keys: ['alice'] } });
      return;
    }
    if (path === 'auth/userpass/users/alice' && method === 'GET') {
      await json(route, { data: { token_policies: ['default'] } });
      return;
    }
    if (path === 'auth/userpass/users/bob' && method === 'POST') {
      state.accountCreates += 1;
      await route.fulfill({ status: 204, headers: corsHeaders });
      return;
    }
    if (path === 'identity/lookup/entity') {
      const body = request.postDataJSON() as { alias_name: string };
      if (body.alias_name !== 'alice') {
        await route.fulfill({ status: 204, headers: corsHeaders });
        return;
      }
      await json(route, { data: { id: 'entity-alice', name: 'Alice', disabled: false, policies: [], group_ids: ['group-platform'], aliases: [{ id: 'alias-alice', name: 'alice', canonical_id: 'entity-alice', mount_accessor: 'auth_userpass_123' }] } });
      return;
    }
    if (path === 'identity/entity/name/Bob') {
      await json(route, { errors: [] }, 404);
      return;
    }
    if (path === 'identity/entity' && method === 'POST') {
      state.entityCreates += 1;
      await json(route, { data: { id: 'entity-bob' } });
      return;
    }
    if (path === 'identity/entity-alias' && method === 'POST') {
      state.aliasAttempts += 1;
      if (options.failAliasOnce && state.aliasAttempts === 1) {
        await json(route, { errors: ['fixture failure'] }, 500);
        return;
      }
      await json(route, { data: { id: 'alias-bob' } });
      return;
    }
    await json(route, { errors: [`Unhandled browser fixture endpoint: ${method} ${path}`] }, 500);
  });
  return state;
}
