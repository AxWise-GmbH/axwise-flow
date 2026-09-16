// Run only in a disposable --network none container. No customer DB or secrets.
import assert from 'node:assert/strict';
import http from 'node:http';
import { setTimeout as delay } from 'node:timers/promises';
import { readFileSync } from 'node:fs';

const receipt = {
  version: 'synthetic_response_canary',
  status: 'succeeded',
  gatewayEffectAttestation: {
    receiptHash: 'a'.repeat(64),
    signature: 'synthetic-not-an-attestation',
    externalReferences: [
      { referenceType: 'operational_record_id', referenceValue: 'synthetic-only' },
    ],
  },
  nested: {
    input: 'Provider-neutral internal record ✓',
    values: [1, true, null, { text: 'x'.repeat(4096) }],
  },
};

if (process.argv[2] === 'serve') {
  http
    .createServer((_request, response) => {
      response.writeHead(200, { 'content-type': 'application/json' });
      response.end(JSON.stringify(receipt));
    })
    .listen(18080, '127.0.0.1');
} else {
  const canary = JSON.parse(readFileSync('/opt/canary/response-canary.workflow.json', 'utf8'));
  const production = JSON.parse(readFileSync('/opt/production-workflow.json', 'utf8'));
  assert.deepEqual(canary.nodes.at(-1).parameters, production.nodes.at(-1).parameters);
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      ready = (
        await fetch('http://127.0.0.1:5678/healthz/readiness', {
          signal: AbortSignal.timeout(1000),
        })
      ).ok;
    } catch {
      /* startup is expected */
    }
    if (ready) break;
    await delay(500);
  }
  assert.equal(ready, true, 'n8n must become ready');
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const result = await fetch('http://127.0.0.1:5678/webhook/local-response-canary', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(10000),
    });
    assert.equal(result.status, 200);
    assert.deepEqual(await result.json(), receipt);
  }
  console.log(
    JSON.stringify({
      verified: true,
      requests: 10,
      mode: 'native-first-incoming-item',
      data: 'synthetic',
      externalNetwork: false,
      customerWrites: 0,
    })
  );
}
