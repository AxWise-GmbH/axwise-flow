import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// @iconify-json/ph is a multi-MB JSON data file, lazily imported by AppIcon only
// when an Outline/Filled icon set is selected at runtime. Tests never load it
// (default set is "mui"), so keep it out of the dep scanner/transform - otherwise
// esbuild spends minutes pre-bundling megabytes of JSON for every worker.
const ICONIFY_DATA = ['@iconify-json/ph'];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  optimizeDeps: {
    exclude: ICONIFY_DATA,
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.js'],
    globals: true,
    include: [
      'src/**/*.test.{js,jsx}',
      'api/**/*.test.js',
      'lib/**/*.test.js',
      'scripts/**/*.test.js',
      'server/**/*.test.js',
      'shared/**/*.test.js',
    ],
    server: {
      deps: {
        external: [/@iconify-json\//],
      },
    },
  },
});
