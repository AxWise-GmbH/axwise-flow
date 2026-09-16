import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  base: '/orchestratori/',
  resolve: {
    alias: {
      'react-router-dom': path.resolve(__dirname, 'src/landing-router-shim.jsx'),
    },
  },
  build: {
    outDir: 'dist-landing',
    emptyOutDir: true,
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      input: path.resolve(__dirname, 'landing.html'),
    },
  },
});
