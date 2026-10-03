import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm, readdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { generate50FileTsProject, runRefactorBenchmarkComparison } from './benchmark-multi-file-ts-refactor.mjs';

test('generate50FileTsProject creates exactly 50 valid TypeScript files with consumers and tsconfig', async () => {
  const tempDir = await mkdtemp(join(tmpdir(), 'ts-50-bench-'));
  try {
    const info = await generate50FileTsProject(tempDir);
    assert.equal(info.totalFiles, 50);
    assert.equal(info.consumerCount, 45);

    // Verify tsconfig.json exists
    const tsconfigRaw = await readFile(join(tempDir, 'tsconfig.json'), 'utf8');
    const tsconfig = JSON.parse(tsconfigRaw);
    assert.equal(tsconfig.compilerOptions.strict, true);

    // Verify core file exists
    const coreRaw = await readFile(join(tempDir, info.coreFile), 'utf8');
    assert.match(coreRaw, /export function calculateDiscount/);

    // Verify all 45 consumers exist and import core
    const services = await readdir(join(tempDir, 'src/services'));
    assert.equal(services.length, 45);
    const sampleConsumer = await readFile(join(tempDir, info.consumerPaths[0]), 'utf8');
    assert.match(sampleConsumer, /import \{ calculateDiscount/);

    // Run benchmark comparison logic
    const benchmark = await runRefactorBenchmarkComparison(info);
    assert.equal(benchmark.comparison.standardTools.turnsRequired, 47);
    assert.equal(benchmark.comparison.nativeLspTools.turnsRequired, 3);
    assert.ok(benchmark.comparison.savings.turnReductionPct > 90);
    assert.ok(benchmark.comparison.savings.tokenSavingsPct > 80);
    assert.ok(benchmark.comparison.savings.timeReductionPct > 80);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});
