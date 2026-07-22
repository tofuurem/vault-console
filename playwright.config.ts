import { defineConfig } from '@playwright/test';

const externalBaseURL = process.env.PLAYWRIGHT_BASE_URL;

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  workers: externalBaseURL ? 1 : undefined,
  timeout: 30_000,
  expect: { timeout: 8_000 },
  reporter: [['list']],
  use: {
    baseURL: externalBaseURL ?? 'http://127.0.0.1:43173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  webServer: externalBaseURL ? undefined : {
    command: 'npm run dev -- --host 127.0.0.1 --port 43173 --strictPort',
    url: 'http://127.0.0.1:43173/login',
    reuseExistingServer: false,
    timeout: 30_000,
  },
  projects: [
    { name: 'chromium', use: { browserName: 'chromium', viewport: { width: 1440, height: 900 } } },
  ],
});
