import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createKernel } from '../src/runtime.mjs';

const rustWorker = process.env.AXWISE_RUST_WORKER || '/Users/admin/.local/bin/axwise-worker';

test('axwise-worker persistent daemon performs multiple calls over single child process', async () => {
  const kernel = createKernel({
    rustWorker,
    persistent: true,
  });

  try {
    const desc1 = await kernel({ operation: 'describe' });
    assert.equal(desc1.protocolVersion, 1);
    assert.ok(Array.isArray(desc1.tools));

    const prep = await kernel({
      operation: 'prepare',
      tool: 'create_prd',
      input: { brief: 'Build an offline-first AI assistant in Rust' },
    });
    assert.ok(prep.systemPrompt.includes('Axwise'));
    assert.equal(prep.context.tool, 'create_prd');

    const desc2 = await kernel({ operation: 'describe' });
    assert.equal(desc2.protocolVersion, 1);
    assert.equal(desc2.tools.length, desc1.tools.length);
  } finally {
    kernel.close?.();
  }
});
