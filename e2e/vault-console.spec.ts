import { expect, test } from '@playwright/test';

const vaultToken = process.env.E2E_VAULT_TOKEN;
const limitedVaultToken = process.env.E2E_LIMITED_VAULT_TOKEN;
const partialListVaultToken = process.env.E2E_PARTIAL_LIST_VAULT_TOKEN;
const restrictedAccessToken = process.env.E2E_RESTRICTED_ACCESS_TOKEN;

test.skip(!vaultToken, 'E2E_VAULT_TOKEN is supplied by the disposable real-Vault harness.');

async function login(page: import('@playwright/test').Page, token = vaultToken) {
  await page.goto('/login');
  await expect(page.getByLabel('Vault server')).toHaveCount(0);
  await expect(page.getByText('Vault is ready')).toBeVisible();
  await page.getByLabel('Vault token').fill(token!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Application secrets' })).toBeVisible();
}

test('restores the authenticated route after a full page reload', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Open folder platform/' }).click();
  await expect(page).toHaveURL(/\/explorer\/applications\/platform\/$/);
  await expect(page.getByRole('button', { name: 'Inspect secret platform/api' })).toBeVisible();

  await page.goBack();
  await expect(page).toHaveURL(/\/explorer\/applications$/);
  await expect(page.getByRole('button', { name: 'Open folder platform/' })).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(/\/explorer\/applications\/platform\/$/);
  await expect(page.getByRole('button', { name: 'Inspect secret platform/api' })).toBeVisible();

  await page.reload();

  await expect(page).toHaveURL(/\/explorer\/applications\/platform\/$/);
  await expect(page.getByRole('heading', { name: 'Application secrets' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Inspect secret platform/api' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vault Console' })).toHaveCount(0);
});

test('persists dark appearance and finds a nested logical path across the mount', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: /^Session menu/ }).click();
  await page.getByRole('radio', { name: 'Dark' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.getByRole('radio', { name: 'Entire mount' }).click();
  await page.getByRole('searchbox', { name: 'Search secret paths' }).fill('api');
  await expect(page.getByRole('button', {
    name: 'Open secret platform/api',
  })).toBeVisible();
  await page.getByRole('button', { name: 'Open secret platform/api' }).click();
  await expect(page).toHaveURL(/secret=platform%2Fapi/);
  await expect(page.getByText('URL', { exact: true })).toBeVisible();
});

test('uses the command palette for density, favorites, and recent secret navigation', async ({ page }) => {
  await login(page);

  await page.keyboard.press('Control+K');
  const paletteSearch = page.getByRole('combobox', { name: 'Search commands' });
  await expect(paletteSearch).toBeFocused();
  await paletteSearch.fill('compact density');
  await page.getByRole('option', { name: /Use compact table density/ }).click();
  await expect(page.getByRole('table')).toHaveAttribute('data-density', 'compact');
  await page.reload();
  await expect(page.getByRole('table')).toHaveAttribute('data-density', 'compact');

  await page.getByRole('button', { name: 'Pin secret shared' }).click();
  await expect(page.getByRole('button', {
    name: 'Open favorites path applications/shared',
  })).toBeVisible();

  await page.getByRole('button', { name: 'Inspect secret nested' }).click();
  await expect(page.getByText('service', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await expect(page.getByRole('button', {
    name: 'Open recent path applications/nested',
  })).toBeVisible();

  await page.getByRole('button', { name: 'Open folder platform/' }).click();
  await page.keyboard.press('Control+K');
  await page.getByRole('combobox', { name: 'Search commands' }).fill('applications/shared');
  const favorite = page.getByRole('option', { name: /applications\/shared/ });
  await expect(favorite).toContainText('Favorite secret');
  await favorite.click();
  await expect(page).toHaveURL(/\/explorer\/applications\?secret=shared$/);
  await expect(page.getByText('API_KEY', { exact: true })).toBeVisible();
});

test('keeps recursive search useful when one listed prefix is forbidden', async ({ page }) => {
  test.skip(
    !partialListVaultToken,
    'E2E_PARTIAL_LIST_VAULT_TOKEN is supplied by the disposable real-Vault harness.',
  );
  await login(page, partialListVaultToken);

  await expect(page.getByRole('button', { name: 'Open folder private/' })).toBeVisible();
  await page.getByRole('radio', { name: 'Entire mount' }).click();
  await page.getByRole('searchbox', { name: 'Search secret paths' }).fill('api');

  await expect(page.getByRole('button', {
    name: 'Open secret platform/api',
  })).toBeVisible();
  await expect(page.getByText(/Partial coverage · .* · 1 inaccessible/)).toBeVisible();
});

test('collapses and expands a deeply linked logical path without losing the route', async ({ page }) => {
  await login(page);
  await page.goto('/explorer/applications/deep/one/two/three/four/five/');

  await expect(page).toHaveURL(/\/explorer\/applications\/deep\/one\/two\/three\/four\/five\/$/);
  await expect(page.getByRole('button', { name: 'Inspect secret deep/one/two/three/four/five/secret' }))
    .toBeVisible();
  const breadcrumbs = page.getByRole('navigation', { name: 'Secret path' });
  const expand = breadcrumbs.getByRole('button', { name: 'Show 3 hidden path segments' });
  await expect(expand).toBeVisible();
  await expect(breadcrumbs.getByRole('button', { name: 'one/', exact: true })).toHaveCount(0);
  await expand.click();
  await expect(breadcrumbs.getByRole('button', { name: 'one/', exact: true })).toBeVisible();
  await breadcrumbs.getByRole('button', { name: 'Collapse middle path segments' }).click();
  await expect(breadcrumbs.getByRole('button', { name: 'one/', exact: true })).toHaveCount(0);
});

test('signs in with userpass without persisting the password and signs out cleanly', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Username & password' }).click();
  const username = page.getByLabel('Username', { exact: true });
  const password = page.getByLabel('Password', { exact: true });
  await expect(username).toHaveAttribute('name', 'username');
  await expect(username).toHaveAttribute(
    'autocomplete',
    'section-vaultuserpass username',
  );
  await expect(password).toHaveAttribute('name', 'password');
  await expect(password).toHaveAttribute(
    'autocomplete',
    'section-vaultuserpass current-password',
  );
  await username.fill('e2e-login');
  await password.fill('e2e-password');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Application secrets' })).toBeVisible();
  const storedSession = await page.evaluate(() => sessionStorage.getItem('vault-console.session.v1'));
  expect(storedSession).toContain('"authMethod":"userpass"');
  expect(storedSession).not.toContain('e2e-password');

  await page.getByRole('button', { name: /^Session menu/ }).click();
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);
});

test('reads secret data when metadata history is denied', async ({ page }) => {
  test.skip(!limitedVaultToken, 'E2E_LIMITED_VAULT_TOKEN is supplied by the disposable real-Vault harness.');
  await login(page, limitedVaultToken);

  await page.getByText('shared', { exact: true }).first().click();
  await expect(page.getByText('API_KEY')).toBeVisible();
  await expect(page.getByText('Secret data is not allowed')).toHaveCount(0);

  await page.getByRole('tab', { name: 'Versions' }).click();
  await expect(page.getByText('Version history is not allowed')).toBeVisible();

  const metadata = await page.request.get('/v1/applications/metadata/shared', {
    headers: { 'X-Vault-Token': limitedVaultToken! },
  });
  expect(metadata.status()).toBe(403);
});

test('creates and opens a KV v2 mount through real Vault', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Create KV v2 mount' }).click();
  await page.getByLabel('Mount path').fill('e2e-created');
  await page.getByLabel('Description').fill('Created by browser E2E');
  await expect(page.getByText('Permission verified for this path.')).toBeVisible();
  await page.getByRole('button', { name: 'Create mount' }).click();

  await expect(page).toHaveURL(/\/explorer\/e2e-created$/);
  await expect(page.getByRole('heading', { name: 'Created by browser E2E' })).toBeVisible();
  const mounts = await page.request.get('/v1/sys/mounts', {
    headers: { 'X-Vault-Token': vaultToken! },
  });
  expect(mounts.ok()).toBe(true);
  const body = await mounts.json();
  expect(body.data['e2e-created/'].options.version).toBe('2');
});

test('browses KV v2 and creates an identity-backed user in real Vault', async ({ page }) => {
  await login(page);

  await page.getByText('shared', { exact: true }).first().click();
  await expect(page.getByText('API_KEY')).toBeVisible();
  await page.getByRole('button', { name: 'Access Center' }).click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await page.getByRole('button', { name: /Create user/ }).click();
  await page.getByLabel(/Username/).fill('e2e-user');
  await page.getByLabel(/Display name/).fill('E2E User');
  await page.getByRole('button', { name: /Continue to access/ }).click();
  await page.getByRole('checkbox', { name: /platform-team/i }).click();
  await expect(page.getByTestId('effective-level-applications:')).toContainText('View');
  await page.getByRole('button', { name: /Review & create/ }).click();
  await page.getByRole('button', { name: 'Create user' }).click();

  await expect(page.getByText('User created successfully')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByText('e2e-user', { exact: true })).toBeVisible();

  const account = await page.request.get('/v1/auth/userpass/users/e2e-user', {
    headers: { 'X-Vault-Token': vaultToken! },
  });
  expect(account.ok()).toBe(true);
});

test('guards unsaved access drafts and keeps Access Center navigation client-side', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Access Center' }).click();
  await page.evaluate(() => {
    document.body.dataset.e2eNavigationMarker = 'preserved';
    document.body.dataset.e2eConfirmCalls = '0';
    window.confirm = () => {
      const calls = Number(document.body.dataset.e2eConfirmCalls ?? '0') + 1;
      document.body.dataset.e2eConfirmCalls = String(calls);
      return calls > 1;
    };
  });
  await page.getByRole('button', { name: 'Roles', exact: true }).click();
  await page.getByRole('button', { name: 'Create role' }).click();
  await page.getByLabel('Role identifier').fill('discarded-browser-draft');

  await page.getByRole('button', { name: 'Groups', exact: true }).click();
  await expect(page).toHaveURL(/\/access-control\/roles\/new$/);
  await expect(page.getByLabel('Role identifier')).toHaveValue('discarded-browser-draft');
  await expect.poll(
    () => page.evaluate(() => document.body.dataset.e2eConfirmCalls),
  ).toBe('1');

  await page.getByRole('button', { name: 'Groups', exact: true }).click();
  await expect(page).toHaveURL(/\/access-control\/groups$/);
  await expect(page.getByRole('heading', { name: 'Internal groups' })).toBeVisible();
  expect(await page.evaluate(() => document.body.dataset.e2eNavigationMarker))
    .toBe('preserved');
  await expect.poll(
    () => page.evaluate(() => document.body.dataset.e2eConfirmCalls),
  ).toBe('2');
});

test('creates a role and group, then updates a managed user through real Vault', async ({ page }) => {
  test.setTimeout(90_000);
  await login(page);
  await page.getByRole('button', { name: 'Access Center' }).click();

  await page.getByRole('button', { name: 'Roles' }).click();
  await page.getByRole('button', { name: 'Create role' }).click();
  await page.getByLabel('Role identifier').fill('browser-lifecycle-reader');
  await page.getByLabel('Description').fill('Browser lifecycle read access');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByLabel('Logical path').fill('browser-lifecycle');
  await page.getByRole('button', { name: 'Add target' }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: 'Create role' }).click();

  await expect(page).toHaveURL(
    /\/access-control\/roles\/vc-role-browser-lifecycle-reader$/,
  );
  await expect(page.getByRole('heading', {
    name: 'Browser Lifecycle Reader',
  })).toBeFocused();
  const roleResponse = await page.request.get(
    '/v1/sys/policies/acl/vc-role-browser-lifecycle-reader',
    { headers: { 'X-Vault-Token': vaultToken! } },
  );
  expect(roleResponse.ok()).toBe(true);
  expect((await roleResponse.json()).data.policy)
    .toContain('"description":"Browser lifecycle read access"');

  await page.getByRole('button', { name: 'Groups' }).click();
  await page.getByRole('button', { name: 'Create group' }).click();
  await page.getByLabel('Group name').fill('Browser lifecycle team');
  await page.getByLabel('Description').fill('Managed through browser lifecycle E2E');
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('checkbox', { name: /E2E Lifecycle User/ }).check();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('checkbox', { name: /Browser Lifecycle Reader/ }).check();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: 'Create group' }).click();

  await expect(page.getByRole('heading', {
    name: 'Browser lifecycle team',
  })).toBeFocused();
  const groupsResponse = await page.request.get('/v1/identity/group/id?list=true', {
    headers: { 'X-Vault-Token': vaultToken! },
  });
  expect(groupsResponse.ok()).toBe(true);
  const groupIds = (await groupsResponse.json()).data.keys as string[];
  let createdGroupId: string | undefined;
  for (const groupId of groupIds) {
    const response = await page.request.get(`/v1/identity/group/id/${groupId}`, {
      headers: { 'X-Vault-Token': vaultToken! },
    });
    if ((await response.json()).data.name === 'Browser lifecycle team') {
      createdGroupId = groupId;
      break;
    }
  }
  expect(createdGroupId).toBeTruthy();

  await page.getByRole('button', { name: 'Users' }).click();
  await page.getByRole('button', { name: 'Open user e2e-lifecycle' }).click();
  await page.getByRole('button', { name: 'Edit access' }).click();
  const displayName = page.getByLabel('Display name');
  await displayName.fill('E2E Lifecycle Operator');
  await page.getByRole('button', { name: /Continue/ }).click();
  const lifecycleGroup = page.getByRole('checkbox', {
    name: /Browser lifecycle team/,
  });
  await expect(lifecycleGroup).toBeChecked();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Continue/ }).click();
  await page.getByRole('button', { name: /Apply 1 change/ }).click();

  await expect(page.getByRole('heading', {
    name: 'E2E Lifecycle Operator',
  })).toBeFocused();
  const createdGroupResponse = await page.request.get(
    `/v1/identity/group/id/${createdGroupId}`,
    { headers: { 'X-Vault-Token': vaultToken! } },
  );
  expect(createdGroupResponse.ok()).toBe(true);
  const memberEntityIds = (await createdGroupResponse.json()).data.member_entity_ids as string[];
  expect(memberEntityIds).toHaveLength(1);
  const entityResponse = await page.request.get(
    `/v1/identity/entity/id/${memberEntityIds[0]}`,
    { headers: { 'X-Vault-Token': vaultToken! } },
  );
  expect(entityResponse.ok()).toBe(true);
  const entity = (await entityResponse.json()).data;
  expect(entity.name).toBe('E2E Lifecycle Operator');
  expect(entity.group_ids).toContain(createdGroupId);
});

test('explains effective KV access from real user, group, and policy sources', async ({ page }) => {
  test.setTimeout(60_000);
  await login(page);

  await expect(page.getByRole('button', { name: 'Access Center' })).toHaveCount(1);
  await page.getByRole('button', { name: 'Access Center' }).click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await page.getByRole('button', { name: 'Open user e2e-access' }).click();

  await expect(page).toHaveURL(/\/access-control\/users\/e2e-access\?mount=userpass$/);
  await expect(page.getByRole('heading', { name: 'E2E Access Operator' })).toBeFocused();
  await expect(page.getByText('Partial visibility')).toBeVisible();

  const directRow = page.getByRole('button', {
    name: 'Explain access to applications/teams/direct/',
  });
  const groupRow = page.getByRole('button', {
    name: 'Explain access to applications/platform/',
  });
  const ownerRow = page.getByRole('button', {
    name: 'Explain access to applications/lifecycle',
  });
  await expect(directRow).toContainText('Edit');
  await expect(groupRow).toContainText('View');
  await expect(ownerRow).toContainText('Owner');

  await expect(page.getByText(
    'E2e Direct Editor → vc-role-e2e-direct-editor',
  )).toBeVisible();
  await expect(page.getByText(
    'e2e-access-team → E2e Group Readers → vc-role-e2e-group-readers',
  )).toBeVisible();
  await expect(page.getByText('User rule → vc-user-e2e-access')).toBeVisible();
  const externalSource = page.locator('li').filter({ hasText: 'e2e-external-audit' });
  await expect(externalSource).toContainText('External HCL');
  await externalSource.getByText('View raw HCL').click();
  await expect(externalSource).toContainText(
    'This policy is intentionally external to Vault Console',
  );

  await groupRow.click();
  const explanationHeading = page.getByRole('heading', {
    name: 'applications/platform/',
  });
  await expect(explanationHeading).toBeVisible();
  const explanation = explanationHeading.locator('xpath=ancestor::section[1]');
  await expect(explanation.getByLabel(
    'read from e2e-access-team → E2e Group Readers',
  ).first()).toBeVisible();
  const tableBox = await page.getByRole('table', {
    name: 'Effective KV access by logical path',
  }).boundingBox();
  const explanationBox = await explanation.boundingBox();
  expect(tableBox).not.toBeNull();
  expect(explanationBox).not.toBeNull();
  expect(explanationBox!.y).toBeGreaterThanOrEqual(tableBox!.y + tableBox!.height);

  const secretValueReads: string[] = [];
  const captureSecretReads = (request: import('@playwright/test').Request) => {
    const path = new URL(request.url()).pathname;
    if (path.startsWith('/v1/applications/data/')) secretValueReads.push(path);
  };
  page.on('request', captureSecretReads);
  await page.getByRole('button', { name: 'All visible paths' }).click();
  await page.getByLabel('Mount to discover').selectOption('applications');
  await page.getByRole('button', { name: 'Discover visible paths' }).click();
  await expect(page.getByText(/Discovery complete · \d+ paths/)).toBeVisible();
  page.off('request', captureSecretReads);
  expect(secretValueReads).toEqual([]);

  await page.reload();
  await expect(page.getByRole('heading', { name: 'E2E Access Operator' })).toBeVisible();
  await page.goto('/access-control/policies');
  await expect(page.getByRole('heading', { name: 'Policy explorer' })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Policy explorer' })).toBeVisible();
  await page.getByRole('button', { name: 'Open applications mount' }).click();
  await expect(page.getByRole('heading', { name: 'Application secrets' })).toBeVisible();
});

test('keeps a useful partial access profile for a restricted operator', async ({ page }) => {
  test.skip(
    !restrictedAccessToken,
    'E2E_RESTRICTED_ACCESS_TOKEN is supplied by the disposable real-Vault harness.',
  );
  await login(page, restrictedAccessToken);

  await page.getByRole('button', { name: 'Access Center' }).click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await page.getByRole('button', { name: 'Open user e2e-access' }).click();

  await expect(page.getByRole('heading', { name: 'e2e-access' })).toBeVisible();
  await expect(page.getByText('Limited by policy')).toBeVisible();
  await expect(page.getByText(/current operator token blocks/i)).toBeVisible();
  await expect(page.getByRole('button', {
    name: 'Explain access to applications/teams/direct/',
  })).toContainText('Edit');
  await expect(
    page.locator('li').filter({ hasText: 'vc-role-e2e-direct-editor' }),
  ).toContainText('Resolved');
  await expect(
    page.locator('li').filter({ hasText: 'vc-user-e2e-access' }),
  ).toContainText('Denied');
  await expect(
    page.locator('li').filter({ hasText: 'e2e-external-audit' }),
  ).toContainText('Denied');
  await expect(page.getByText('This access-control resource could not be loaded')).toHaveCount(0);
});

test('reads and edits nested JSON without flattening it', async ({ page }) => {
  await login(page);

  await page.getByText('nested', { exact: true }).first().click();
  await expect(page.getByText('service', { exact: true })).toBeVisible();
  await expect(page.getByText('object', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open inspector full screen' }).click();

  const workspace = page.getByRole('dialog', { name: 'applications/nested' });
  await expect(workspace).toBeVisible();
  await expect(workspace.getByText('real-vault-nested-value', { exact: true })).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Edit secret' }).click();

  await workspace.getByLabel('Secret JSON editor').fill('{\n  "service":,\n}');
  await workspace.getByRole('button', { name: 'Save version 2' }).click();
  await expect(workspace.getByRole('alert')).toContainText(/JSON syntax error at line 2, column \d+:/);

  const nextData = {
    service: {
      credentials: { access: 'rotated-real-vault-value' },
      ports: [443, 9443],
      enabled: false,
    },
  };
  await workspace.getByLabel('Secret JSON editor').fill(JSON.stringify(nextData, null, 2));
  await workspace.getByRole('button', { name: 'Save version 2' }).click();
  await expect(workspace).toHaveCount(0);

  const response = await page.request.get('/v1/applications/data/nested', {
    headers: { 'X-Vault-Token': vaultToken! },
  });
  expect(response.ok()).toBe(true);
  const body = await response.json();
  expect(body.data.data).toEqual(nextData);
});

test('compares, deletes, undeletes, and permanently destroys real KV versions', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Inspect secret lifecycle' }).click();
  const inspector = page.getByRole('complementary', { name: 'Secret inspector' });
  await inspector.getByRole('tab', { name: 'Versions' }).click();
  await expect(inspector.getByText('v3', { exact: true })).toBeVisible();
  await expect(inspector.getByText('v1', { exact: true })).toBeVisible();

  await inspector.getByRole('button', { name: 'Compare version 3' }).click();
  const comparison = page.getByRole('dialog', { name: 'Compare and restore versions' });
  await expect(comparison).toBeVisible();
  await expect(comparison.getByLabel('Version A')).toHaveValue('2');
  await expect(comparison.getByLabel('Version B')).toHaveValue('3');
  await comparison.getByRole('button', { name: 'Close', exact: true }).click();

  const concurrentWrite = await page.request.post('/v1/applications/data/lifecycle', {
    headers: { 'X-Vault-Token': vaultToken! },
    data: {
      data: { STATE: 'concurrent-fourth' },
      options: { cas: 3 },
    },
  });
  expect(concurrentWrite.ok()).toBe(true);

  await inspector.getByRole('button', { name: 'Version actions for version 3' }).click();
  await inspector.getByRole('menuitem', { name: 'Delete current version 3' }).click();
  const softDelete = page.getByRole('dialog', { name: 'Soft-delete current version' });
  await expect(softDelete.getByLabel('Type applications/lifecycle to confirm')).toHaveCount(0);
  await softDelete.getByRole('button', { name: 'Delete current version' }).click();
  await expect(page.getByText(
    'Version 3 of applications/lifecycle was soft-deleted.',
  )).toBeVisible();
  await expect(inspector.getByText('Deleted', { exact: true })).toBeVisible();

  const metadataAfterDelete = await page.request.get('/v1/applications/metadata/lifecycle', {
    headers: { 'X-Vault-Token': vaultToken! },
  });
  expect(metadataAfterDelete.ok()).toBe(true);
  const metadataAfterDeleteBody = await metadataAfterDelete.json();
  expect(metadataAfterDeleteBody.data.versions['3'].deletion_time).not.toBe('');
  expect(metadataAfterDeleteBody.data.versions['4'].deletion_time).toBe('');

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText(
    'Restored version 3 of applications/lifecycle.',
  )).toBeVisible();
  await expect(inspector.getByText('Current', { exact: true })).toBeVisible();
  await page.getByRole('button', {
    name: 'Dismiss Restored version 3 of applications/lifecycle. notification',
  }).click();

  await inspector.getByRole('button', { name: 'Version actions for version 1' }).click();
  await inspector.getByRole('menuitem', { name: 'Destroy version 1' }).click();
  const destroy = page.getByRole('dialog', { name: 'Permanently destroy version' });
  await destroy.getByLabel('Type applications/lifecycle to confirm').fill('applications/lifecycle');
  await destroy.getByRole('button', { name: 'Destroy version permanently' }).click();
  await expect(page.getByText(
    'Permanently destroyed version 1 of applications/lifecycle.',
  )).toBeVisible();
  await expect(inspector.getByText('Destroyed', { exact: true })).toBeVisible();

  const metadata = await page.request.get('/v1/applications/metadata/lifecycle', {
    headers: { 'X-Vault-Token': vaultToken! },
  });
  expect(metadata.ok()).toBe(true);
  const body = await metadata.json();
  expect(body.data.versions['3'].deletion_time).toBe('');
  expect(body.data.versions['4'].deletion_time).toBe('');
  expect(body.data.versions['1'].destroyed).toBe(true);
});

test('soft-deletes, undoes, and explicitly destroys selected real Vault versions', async ({ page }) => {
  await login(page);

  await page.getByRole('checkbox', { name: 'Select secret bulk-one' }).click();
  await page.getByRole('checkbox', { name: 'Select secret bulk-two' }).click();
  await page.getByRole('button', { name: 'Soft-delete latest' }).click();
  await page.getByRole('button', {
    name: 'Soft-delete 2 current versions',
  }).click();
  await expect(page.getByText('2 current versions were soft-deleted.')).toBeVisible();
  const undeleteResponse = page.waitForResponse((response) => (
    response.url().includes('/v1/applications/undelete/')
    && response.request().method() === 'POST'
  ));
  await page.getByRole('button', { name: 'Undo 2' }).click();
  await expect((await undeleteResponse).ok()).toBe(true);
  await expect.poll(async () => {
    const deletionTimes = await Promise.all(
      ['bulk-one', 'bulk-two'].map(async (path) => {
        const metadata = await page.request.get(`/v1/applications/metadata/${path}`, {
          headers: { 'X-Vault-Token': vaultToken! },
        });
        return (await metadata.json()).data.versions['2'].deletion_time;
      }),
    );
    return deletionTimes;
  }).toEqual(['', '']);
  await expect(page.getByText(
    'Restored 2 soft-deleted current versions.',
  )).toBeVisible();

  await page.getByRole('checkbox', { name: 'Select secret bulk-one' }).click();
  await page.getByRole('checkbox', { name: 'Select secret bulk-two' }).click();
  await page.getByRole('button', { name: 'Destroy versions…' }).click();
  const destroy = page.getByRole('dialog', {
    name: 'Permanently destroy versions',
  });
  await destroy.getByRole('checkbox', {
    name: 'Destroy bulk-one version 1',
  }).click();
  await destroy.getByRole('checkbox', {
    name: 'Destroy bulk-two version 1',
  }).click();
  await destroy.getByLabel('Type applications to confirm').fill('applications');
  await destroy.getByRole('button', {
    name: 'Destroy 2 versions permanently',
  }).click();
  await expect(page.getByText(
    'Permanently destroyed 2 versions across 2 secrets.',
  )).toBeVisible();
  await expect(page.getByRole('button', { name: /^Undo/ })).toHaveCount(0);

  for (const path of ['bulk-one', 'bulk-two']) {
    const metadata = await page.request.get(`/v1/applications/metadata/${path}`, {
      headers: { 'X-Vault-Token': vaultToken! },
    });
    expect(metadata.ok()).toBe(true);
    const body = await metadata.json();
    expect(body.data.versions['1'].destroyed).toBe(true);
    expect(body.data.versions['2'].deletion_time).toBe('');
  }
});

test('keeps navigation and the secret inspector usable across the responsive matrix', async ({ page }) => {
  test.setTimeout(60_000);
  await page.setViewportSize({ width: 600, height: 800 });
  await login(page);

  await expect(page.getByRole('complementary', { name: 'Vault navigation' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Open navigation' }).click();
  const mobileNavigation = page.getByRole('dialog', { name: 'Vault navigation' });
  await expect(mobileNavigation).toBeVisible();
  await expect(mobileNavigation.getByText('applications/')).toBeVisible();
  await mobileNavigation.getByRole('button', { name: 'Close drawer' }).click();
  await page.getByText('nested', { exact: true }).first().click();
  const inspector = page.getByRole('dialog', { name: 'applications/nested' });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText('service', { exact: true })).toBeVisible();
  await inspector.getByRole('tab', { name: 'Versions' }).click();
  await expect(inspector.getByText('v1', { exact: true })).toBeVisible();
  await inspector.getByRole('tab', { name: 'Metadata' }).click();
  await expect(inspector.getByText('Logical path')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await inspector.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog', { name: 'Vault navigation' })
    .getByRole('button', { name: 'Access Center' }).click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  const createUser = page.getByRole('button', { name: 'Create user' });
  await expect(createUser).toBeVisible();
  const createUserBounds = await createUser.boundingBox();
  expect(createUserBounds).not.toBeNull();
  expect(createUserBounds!.x + createUserBounds!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByLabel('Search users').fill('e2e');
  await page.getByRole('button', { name: 'Open user e2e-access' }).click();
  await expect(page.getByRole('heading', { name: 'E2E Access Operator' })).toBeVisible();
  await page.getByRole('button', {
    name: 'Explain access to applications/platform/',
  }).click();
  await expect(page.getByRole('heading', {
    name: 'applications/platform/',
  })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Back to users' }).click();
  await expect(page.getByLabel('Search users')).toHaveValue('e2e');
  await expect(page.getByRole('button', { name: 'Open user e2e-access' })).toBeFocused();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await page.getByRole('dialog', { name: 'Vault navigation' })
    .getByRole('button', { name: 'Open applications mount' }).click();
  await expect(page.getByRole('heading', { name: 'Application secrets' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);

  await page.setViewportSize({ width: 1024, height: 900 });
  await page.getByRole('button', { name: 'Inspect secret nested' }).click();
  const dockedInspector = page.getByRole('complementary', { name: 'Secret inspector' });
  await dockedInspector.getByRole('button', { name: 'Dock inspector at right' }).click();
  await expect(page.getByRole('separator', { name: 'Resize right inspector' })).toBeVisible();
  await dockedInspector.getByRole('button', { name: 'Open inspector full screen' }).click();
  const fullScreenInspector = page.getByRole('dialog', { name: 'applications/nested' });
  await expect(fullScreenInspector).toBeVisible();
  await fullScreenInspector.getByRole('button', { name: 'Exit inspector full screen' }).click();
  await expect(page.getByRole('separator', { name: 'Resize right inspector' })).toBeVisible();
  await dockedInspector.getByRole('button', { name: 'Dock inspector at bottom' }).click();
  await expect(page.getByRole('separator', { name: 'Resize bottom inspector' })).toBeVisible();
  await dockedInspector.getByRole('button', { name: 'Close inspector' }).click();

  for (const [index, width] of [320, 360, 393, 430, 768, 1024, 1280, 1440].entries()) {
    const secretName = index % 2 === 0 ? 'shared' : 'nested';
    const visibleKey = secretName === 'shared' ? 'API_KEY' : 'service';
    await page.setViewportSize({ width, height: 900 });
    await page.getByRole('button', { name: `Inspect secret ${secretName}` }).click();

    const responsiveInspector = width < 768
      ? page.getByRole('dialog', { name: `applications/${secretName}` })
      : page.getByRole('complementary', { name: 'Secret inspector' });
    await expect(responsiveInspector).toBeVisible();
    await expect(responsiveInspector.getByText(visibleKey, { exact: true })).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth),
    ).toBe(true);

    await responsiveInspector.getByRole('button', { name: 'Close inspector' }).click();
  }
});
