import { expect, test } from '@playwright/test';

const vaultToken = process.env.E2E_VAULT_TOKEN;
const limitedVaultToken = process.env.E2E_LIMITED_VAULT_TOKEN;

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

test('signs in with userpass without persisting the password and signs out cleanly', async ({ page }) => {
  await page.goto('/login');
  await page.getByRole('tab', { name: 'Username & password' }).click();
  await page.getByLabel('Username', { exact: true }).fill('e2e-login');
  await page.getByLabel('Password', { exact: true }).fill('e2e-password');
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
  await page.getByRole('button', { name: 'Users' }).click();
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

  await inspector.getByRole('button', { name: 'Version actions for version 3' }).click();
  await inspector.getByRole('menuitem', { name: 'Delete current version 3' }).click();
  const softDelete = page.getByRole('dialog', { name: 'Soft-delete current version' });
  await expect(softDelete.getByLabel('Type applications/lifecycle to confirm')).toHaveCount(0);
  await softDelete.getByRole('button', { name: 'Delete current version' }).click();
  await expect(page.getByText(
    'Version 3 of applications/lifecycle was soft-deleted.',
  )).toBeVisible();
  await expect(inspector.getByText('Deleted', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(page.getByText(
    'Restored version 3 of applications/lifecycle.',
  )).toBeVisible();
  await expect(inspector.getByText('Current', { exact: true })).toBeVisible();

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
  await page.getByRole('button', { name: 'Undo 2' }).click();
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
    .getByRole('button', { name: 'Users' }).click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await page.setViewportSize({ width: 320, height: 900 });
  const createUser = page.getByRole('button', { name: 'Create user' });
  await expect(createUser).toBeVisible();
  const createUserBounds = await createUser.boundingBox();
  expect(createUserBounds).not.toBeNull();
  expect(createUserBounds!.x + createUserBounds!.width).toBeLessThanOrEqual(320);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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

  for (const [index, width] of [320, 430, 768, 1024, 1440].entries()) {
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
