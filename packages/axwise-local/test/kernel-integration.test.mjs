import assert from 'node:assert/strict';
import { test } from 'node:test';
import { execFileSync } from 'node:child_process';
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createKernel, createSpecialistTools } from '../src/runtime.mjs';

const root = fileURLToPath(new URL('../../../', import.meta.url));
let fixture, python;
try {
  const data = execFileSync(process.env.AXWISE_TEST_PYTHON || 'python3', ['-B', '-c',
    'import json,sys; from backend.tests.local_axwise.fixtures import inputs,candidate; print(json.dumps({"python":sys.executable,"input":inputs()["create_prd"],"candidate":candidate("create_prd")}))'],
  { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, PYTHONPATH: root, PYTHONDONTWRITEBYTECODE: '1' } });
  fixture = JSON.parse(data); python = fixture.python;
} catch (error) {
  if (process.env.AXWISE_TEST_PYTHON) throw error;
}

for (const invalidFirst of [false, true]) {
  test(`real Python worker validates bounded ${invalidFirst ? 'structural' : 'quality'} repair with per-candidate usage`,
    { skip: !python && 'Set AXWISE_TEST_PYTHON to the installed local-kernel Python environment' }, async () => {
      const stateDir = await mkdtemp(join(tmpdir(), 'axwise-kernel-integration-'));
      const requests = []; let generation = 0, reviews = 0;
      const call = createSpecialistTools({ stateDir, accountHash: 'a'.repeat(64), conversationId: 'integration',
        kernel: createKernel({ python, kernelRoot: root }),
        provider: async (prepared) => {
          const payload = JSON.parse(prepared.userPrompt);
          requests.push(payload);
          let response;
          if (payload.requiredCriteria) {
            reviews += 1;
            response = { checks: payload.requiredCriteria.map((criterion, index) => ({ criterion,
              passed: invalidFirst || reviews > 1 || index !== 0,
              reason: 'Fixture-controlled criterion result; this test does not assess model quality.' })) };
          } else {
            generation += 1;
            response = invalidFirst && generation === 1 ? { invalid: true } : fixture.candidate;
          }
          return { response: JSON.stringify(response), usage: { modelCalls: 1, inputTokens: 100, outputTokens: 20 } };
        },
      });
      const result = await call('create_prd', fixture.input);
      assert.equal(result.isError, false, JSON.stringify(result));
      assert.equal(result.structuredContent.execution.calls, invalidFirst ? 3 : 4);
      assert.equal(result.structuredContent.usage.inputTokens, requests.length * 100);
      assert.equal(result.structuredContent.qualityReview.passed, true);
      assert.equal(generation, 2);
      assert.equal(requests.filter((request) => request.repair).length, 1);
    });
}
