#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

console.log('=== RUNNING LIVE ORQANIX DESKTOP RUST SESSION TEST ===\n');

const child = spawn('/Users/admin/.local/bin/axwise-mcp', [], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, AXWISE_USE_RUST: '1' },
});

const lines = createInterface({ input: child.stdout });
let nextId = 1;
const pending = new Map();

lines.on('line', (line) => {
  try {
    const res = JSON.parse(line);
    const cb = pending.get(res.id);
    if (cb) {
      pending.delete(res.id);
      cb(res);
    }
  } catch (err) {
    console.error('Failed to parse line:', line, err);
  }
});

function request(method, params = {}) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n');
  });
}

async function run() {
  const t0 = performance.now();

  // 1. Initialize
  console.log('[1/4] Handshake: initialize...');
  const initRes = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'orqanix-desktop', version: '1.2.0' }
  });
  console.log('      Result:', initRes.result.serverInfo);

  // 2. Tools list
  console.log('[2/4] Querying available tools...');
  const toolsRes = await request('tools/list');
  const toolNames = toolsRes.result.tools.map(t => t.name);
  console.log('      Available tools (8):', toolNames.join(', '));

  // 3. Create PRD Tool Call
  console.log('[3/4] Calling create_prd...');
  const prdRes = await request('tools/call', {
    name: 'create_prd',
    arguments: {
      brief: 'Autonomous cold-chain telemetry tracking for Baltic refrigerated transport.',
      artifactType: 'software_prd',
      depth: 'standard'
    }
  });
  console.log('      Output:', prdRes.result.content[0].text);

  // 4. Simulate Interviews Tool Call
  console.log('[4/4] Calling simulate_interviews with OCEAN trait generation...');
  const simRes = await request('tools/call', {
    name: 'simulate_interviews',
    arguments: {
      scenario: 'Autonomous fleet dispatch',
      stakeholders: [{
        id: 'fleet_manager',
        label: 'Fleet Manager',
        description: 'Oversees 200 autonomous refrigerated trucks',
        questions: ['How do you manage battery and temperature constraints simultaneously?'],
        participants: 2,
        countryCode: 'LV',
        locality: 'Riga'
      }],
      seed: 42
    }
  });
  console.log('      Output:', simRes.result.content[0].text);

  const totalMs = (performance.now() - t0).toFixed(2);
  console.log(`\n✅ LIVE ORQANIX DESKTOP SESSION TEST PASSED in ${totalMs} ms!`);

  child.stdin.end();
  child.kill();
  process.exit(0);
}

run().catch(err => {
  console.error('Test failed:', err);
  child.kill();
  process.exit(1);
});
