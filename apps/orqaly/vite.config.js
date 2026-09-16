import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const TUNNEL_HMR_HOST = process.env.VITE_TUNNEL_HOST;

// `npm run dev` and the web slot of `npm run dev:local` can run at the same time
// on different ports (5176/5177). They must NOT share one dep-optimization cache:
// whichever starts last rewrites node_modules/.vite/deps with its own discovery
// set, which 404s the ?v=<hash> module URLs the other server's open tabs hold
// ("error loading dynamically imported module"). dev:local's web slot is the only
// one that sets VITE_API_URL, so it keys a separate cache dir.
const CACHE_DIR = process.env.VITE_API_URL ? '.vite-local' : '.vite-default';

const GCP_FORBIDDEN_MODULES = [
  '/src/App.jsx',
  '/src/routes.jsx',
  '/src/context/AuthContext.jsx',
  '/src/context/ThemeContext.jsx',
  '/src/context/PartnerAccessContext.jsx',
  '/src/context/TaskManagerContext.jsx',
  '/src/context/DevTasksContext.jsx',
  '/src/context/ToolRequirementContext.jsx',
  '/src/context/ReplicatorContext.jsx',
  '/src/components/Layout/MainLayout.jsx',
  '/src/components/Layout/Sidebar.jsx',
  '/src/components/Layout/StandardNav.jsx',
  '/src/services/',
  '/src/lib/supabase',
  '/node_modules/@supabase/',
  '/node_modules/@vercel/',
  '/node_modules/@dnd-kit/',
];

function gcpModuleBoundaryGuard(enabled) {
  return {
    name: 'orqaly-gcp-module-boundary',
    apply: 'build',
    generateBundle(_options, bundle) {
      if (!enabled) return;
      for (const output of Object.values(bundle)) {
        if (output.type !== 'chunk') continue;
        for (const id of Object.keys(output.modules)) {
          const normalized = id.replaceAll('\\', '/');
          const forbidden = GCP_FORBIDDEN_MODULES.find((part) => normalized.includes(part));
          if (forbidden) {
            this.error(
              `GCP launch bundle imported forbidden module ${normalized} (matched ${forbidden})`
            );
          }
        }
      }
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isGcpLaunch = mode === 'gcp-launch';
  return {
    plugins: [react(), gcpModuleBoundaryGuard(isGcpLaunch)],
    cacheDir: path.resolve(__dirname, 'node_modules', isGcpLaunch ? '.vite-gcp' : CACHE_DIR),
    publicDir: path.resolve(__dirname, isGcpLaunch ? 'public-gcp' : 'public'),
    resolve: {
      alias: {
        '@': path.resolve(__dirname, 'src'),
        '@orqaly-app-entry': path.resolve(
          __dirname,
          isGcpLaunch ? 'src/GcpApp.jsx' : 'src/App.jsx'
        ),
      },
    },
    // Keep the multi-MB @iconify-json/ph data file out of dev pre-bundling; AppIcon
    // lazily imports it only when an Outline/Filled icon set is selected, and Rollup
    // code-splits it into its own chunk at build time regardless.
    optimizeDeps: {
      exclude: ['@iconify-json/ph'],
    },
    build: {
      chunkSizeWarningLimit: 600,
      manifest: isGcpLaunch,
      // The retained GCP graph has a strict raw-JavaScript release budget. Terser is
      // build-only and produces the same self-hosted assets with tighter compression;
      // it does not add a runtime service or weaken the verifier threshold.
      minify: isGcpLaunch ? 'terser' : 'esbuild',
      terserOptions: isGcpLaunch
        ? {
            module: true,
            compress: { passes: 3 },
            mangle: { toplevel: true },
            format: { comments: false },
          }
        : undefined,
    },
    server: {
      port: 5176,
      strictPort: false,
      host: true,
      allowedHosts: [
        '.ngrok-free.app',
        '.ngrok-free.dev',
        '.ngrok.app',
        '.ngrok.io',
        '.trycloudflare.com',
        '.lhr.life',
        '.localhost.run',
      ],
      hmr: TUNNEL_HMR_HOST
        ? { host: TUNNEL_HMR_HOST, protocol: 'wss', clientPort: 443 }
        : undefined,
      proxy: isGcpLaunch
        ? undefined
        : {
            // Surgical override: the process-maps endpoint is served by the local API
            // server (scripts/local-api-server.js on :3001) so the /data "Guides" view
            // works locally. Listed before '/api' so it takes precedence. Everything
            // else still proxies to production (VITE_API_URL || prod) as before.
            '/api/process-maps': {
              target: process.env.LOCAL_API_URL || 'http://localhost:3001',
              changeOrigin: true,
              secure: false,
            },
            '/api': {
              target: process.env.VITE_API_URL || 'https://orchestratori.vercel.app',
              changeOrigin: true,
              secure: true,
            },
          },
    },
  };
});
