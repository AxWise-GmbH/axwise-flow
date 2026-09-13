import path from 'node:path';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const packageRoot = path.dirname(fileURLToPath(import.meta.url));
const repositoryRoot = path.resolve(packageRoot, '../../..');
const dependencyEntry = (specifier) => fileURLToPath(import.meta.resolve(specifier));

export default defineConfig({
  root: packageRoot,
  plugins: [react()],
  resolve: {
    dedupe: ['react', 'react-dom'],
    alias: [
      {
        find: '@workflow-v2-page',
        replacement: path.resolve(repositoryRoot, 'src/pages/WorkflowV2/WorkflowV2.jsx'),
      },
      { find: /^@clerk\/react$/, replacement: dependencyEntry('@clerk/react') },
      { find: /^@mui\/material$/, replacement: dependencyEntry('@mui/material') },
      { find: /^react\/jsx-runtime$/, replacement: dependencyEntry('react/jsx-runtime') },
      { find: /^react\/jsx-dev-runtime$/, replacement: dependencyEntry('react/jsx-dev-runtime') },
      { find: /^react-dom\/client$/, replacement: dependencyEntry('react-dom/client') },
      { find: /^react$/, replacement: dependencyEntry('react') },
    ],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 700,
  },
});
