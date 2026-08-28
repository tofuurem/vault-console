import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { configDefaults, defineConfig } from 'vitest/config';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    restoreMocks: true,
    exclude: [...configDefaults.exclude, 'e2e/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary'],
      skipFull: false,
      include: [
        'src/application/vault/VaultSessionProvider.tsx',
        'src/application/vault/capability-permissions.ts',
        'src/application/vault/session-storage.ts',
        'src/application/vault/useKvActionPermissions.ts',
        'src/application/vault/useKvExplorerData.ts',
        'src/application/vault/useSessionClock.ts',
        'src/application/vault/bulk/**/*.ts',
        'src/domain/vault/**/*.ts',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        'src/domain/vault/contracts.ts',
      ],
      thresholds: {
        branches: 75,
        functions: 80,
        lines: 80,
        statements: 80,
      },
    },
  },
});
