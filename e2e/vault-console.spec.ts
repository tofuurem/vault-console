import { expect, test } from '@playwright/test';

import { mockVaultApi } from './vault-api';

async function login(page: import('@playwright/test').Page) {
  await page.goto('/login');
  await page.getByLabel('Vault server').fill('http://vault.test:8200');
  await page.getByLabel('Vault token').fill('hvs.browser-fixture');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Application secrets' })).toBeVisible();
}

test('browses KV v2 and safely resumes a partial create-user transaction', async ({ page }) => {
  const state = await mockVaultApi(page, { failAliasOnce: true });
  await login(page);

  await page.getByText('shared', { exact: true }).first().click();
  await expect(page.getByText('API_KEY')).toBeVisible();
  await page.getByRole('button', { name: 'Users' }).click();
  await expect(page.getByRole('heading', { name: 'Users' })).toBeVisible();
  await page.getByRole('button', { name: /Create user/ }).click();
  await page.getByLabel(/Username/).fill('bob');
  await page.getByLabel(/Display name/).fill('Bob');
  await page.getByRole('button', { name: /Continue to access/ }).click();
  await page.getByRole('checkbox', { name: /platform-team/i }).click();
  await expect(page.getByTestId('effective-level-applications:')).toContainText('View');
  await page.getByRole('button', { name: /Review & create/ }).click();
  await page.getByRole('button', { name: 'Create user' }).click();

  await expect(page.getByText('The user was not fully created')).toBeVisible();
  await page.getByRole('button', { name: /Retry from safe point/ }).click();
  await expect(page.getByText('User created successfully')).toBeVisible();
  expect(state).toEqual({ accountCreates: 1, entityCreates: 1, aliasAttempts: 2, groupUpdates: 1 });
});

test('keeps navigation and the secret inspector usable on a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 600, height: 800 });
  await mockVaultApi(page);
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
