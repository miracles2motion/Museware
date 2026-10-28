import { defineConfig, loadEnv, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { handleMuse } from './server/museProxy';

/**
 * Dev-time gate for /api/muse/*. The key is read from .env on the server and
 * never enters the bundle. A session key pasted during onboarding arrives as
 * the x-muse-key header (sessionStorage only) and is used in preference.
 */
function museGate(env: Record<string, string>): Plugin {
  return {
    name: 'museware-muse-gate',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/muse')) return next();
        void handleMuse(req, res, env as never);
      });
    },
    configurePreviewServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url || !req.url.startsWith('/api/muse')) return next();
        void handleMuse(req, res, env as never);
      });
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    plugins: [react(), museGate(env)],
    server: {
      host: '0.0.0.0',
      port: 5173,
      strictPort: false,
      cors: true,
      // The preview proxy serves this app on a wildcard sandbox host.
      allowedHosts: true,
      hmr: { clientPort: 443, protocol: 'wss' },
    },
    preview: { host: '0.0.0.0', port: 4173, allowedHosts: true },
    build: { sourcemap: false, target: 'es2022', chunkSizeWarningLimit: 1600 },
    test: {
      globals: true,
      environment: 'node',
      include: ['src/**/*.test.{ts,tsx}', 'server/**/*.test.ts'],
    },
  };
});
