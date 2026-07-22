import { expect, test } from '@playwright/test';

const vaultToken = process.env.E2E_VAULT_TOKEN;

test.skip(!vaultToken, 'E2E_VAULT_TOKEN is supplied by the disposable real-Vault harness.');

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await expect(page.getByLabel('Vault server')).toHaveValue(new URL(page.url()).origin);
  await page.getByLabel('Vault token').fill(vaultToken!);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Application secrets' })).toBeVisible();
}

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

test('keeps navigation and the secret inspector usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await login(page);

  await expect(page.getByRole('complementary', { name: 'Vault navigation' })).toHaveCSS('width', '44px');
  await page.getByText('shared', { exact: true }).first().click();
  await expect(page.getByRole('complementary', { name: 'Secret inspector' })).toBeVisible();
  await expect(page.getByText('API_KEY')).toBeVisible();
  await page.getByRole('button', { name: 'Close inspector' }).click();
  await page.getByRole('button', { name: 'Users' }).click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});
