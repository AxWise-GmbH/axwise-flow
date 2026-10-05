import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

function getAdaptiveConcurrency() {
  const totalRamGb = Math.round(os.totalmem() / (1024 ** 3));
  const cpuCores = os.cpus()?.length || 4;

  let maxWorkers: number;
  let workerHeapMb: number;

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

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('.', import.meta.url)),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./vitest.setup.ts'],
    clearMocks: true,
    restoreMocks: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        maxForks: maxWorkers,
        minForks: 1,
        execArgv: [`--max-old-space-size=${workerHeapMb}`],
      },
    },
    include: ['tests/stabilization/**/*.test.{ts,tsx}'],
    exclude: ['node_modules/**', '.next/**'],
  },
});
