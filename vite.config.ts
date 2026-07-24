import { resolve } from 'node:path';
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react()],
    base: env.BASE_PATH || '/',
    define: {
      'import.meta.env.VITE_APP_VERSION': JSON.stringify(
        env.VITE_APP_VERSION || process.env.npm_package_version || 'development',
      ),
    },
    build: {
      sourcemap: env.VAULT_UI_BUILD_SOURCEMAPS === 'true' ? 'hidden' : false,
      outDir: 'dist',
    },
    resolve: {
      alias: {
        '@': resolve(__dirname, './src'),
      },
    },
    server: {
      port: 3000,
      host: '0.0.0.0',
    },
  };
});
