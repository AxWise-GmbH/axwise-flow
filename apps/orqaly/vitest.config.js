import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function getAdaptiveConcurrency() {
  const totalRamGb = Math.round(os.totalmem() / (1024 ** 3));
  const cpuCores = os.cpus()?.length || 4;

  let maxWorkers;
  let workerHeapMb;

  if (totalRamGb <= 16) {
    maxWorkers = 2;
    workerHeapMb = 2048;
  } else if (totalRamGb <= 24) {
    maxWorkers = 3;
    workerHeapMb = 2560;
  } else if (totalRamGb <= 32) {
    maxWorkers = Math.min(cpuCores, 5);
    workerHeapMb = 3072;
  } else if (totalRamGb <= 48) {
    maxWorkers = Math.min(cpuCores, 7);
    workerHeapMb = 3584;
  } else {
    maxWorkers = Math.min(cpuCores, 10);
    workerHeapMb = 4096;
  }

  if (process.env.VITEST_MAX_WORKERS) {
    maxWorkers = Math.max(1, parseInt(process.env.VITEST_MAX_WORKERS, 10) || 1);
  }

  return { maxWorkers, workerHeapMb, totalRamGb };
}

const { maxWorkers, workerHeapMb } = getAdaptiveConcurrency();

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
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: maxWorkers,
        minForks: 1,
        execArgv: [`--max-old-space-size=${workerHeapMb}`],
      },
      threads: {
        maxThreads: maxWorkers,
        minThreads: 1,
      },
    },
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
