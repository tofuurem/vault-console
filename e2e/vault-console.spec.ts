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

  await page.reload();

  await expect(page).toHaveURL(/\/explorer\/applications$/);
  await expect(page.getByRole('heading', { name: 'Application secrets' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Vault Console' })).toHaveCount(0);
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
  await page.getByRole('button', { name: 'Open secret full screen' }).click();

  const workspace = page.getByRole('dialog', { name: 'applications/nested' });
  await expect(workspace).toBeVisible();
  await expect(workspace.getByText('real-vault-nested-value', { exact: true })).toHaveCount(0);
  await workspace.getByRole('button', { name: 'Edit secret' }).click();

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

test('keeps navigation and the secret inspector usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await login(page);

  await expect(page.getByRole('complementary', { name: 'Vault navigation' })).toHaveCSS('width', '44px');
  await page.getByText('nested', { exact: true }).first().click();
  await expect(page.getByRole('complementary', { name: 'Secret inspector' })).toBeVisible();
  await expect(page.getByText('service', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open secret full screen' }).click();
  await expect(page.getByRole('dialog', { name: 'applications/nested' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  await page.getByRole('button', { name: 'Close secret workspace' }).click();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Users' }).click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await page.getByRole('button', { name: 'Open applications mount' }).click();
  await expect(page.getByRole('heading', { name: 'Application secrets' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
