#!/usr/bin/env node
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { performance } from 'node:perf_hooks';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';

console.log('================================================================');
console.log('   FULL END-TO-END PRODUCT DISCOVERY PIPELINE TEST (NATIVE RUST)');
console.log('================================================================\n');

const child = spawn('/Users/admin/.local/bin/axwise-mcp', [], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env: { ...process.env, AXWISE_USE_RUST: '1' }
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
    console.error('Line parse error:', err);
  }
});

function callTool(name, args) {
  const id = nextId++;
  return new Promise((resolve, reject) => {
    pending.set(id, (res) => {
      if (res.error) reject(new Error(res.error.message));
      else resolve(res.result);
    });
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'tools/call',
      params: { name, arguments: args }
    }) + '\n');
  });
}

function init() {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    child.stdin.write(JSON.stringify({
      jsonrpc: '2.0',
      id,
      method: 'initialize',
      params: {
        protocolVersion: '2024-11-05',
        capabilities: {},
        clientInfo: { name: 'e2e-discovery-pipeline', version: '0.4.2' }
      }
    }) + '\n');
  });
}

async function run() {
  const startAll = performance.now();
  const stages = [];

  // Initialize
  await init();
  console.log('⚡ Native Axwise v0.4.2 MCP Server Connected\n');

  const topic = 'Autonomous Solar Harbor Cleaning Boat & Telemetry Tracking for Baltic Ports';

  // -------------------------------------------------------------
  // STAGE 1: PREPARE DISCOVERY (Framing)
  // -------------------------------------------------------------
  console.log('▶ [Stage 1/5] PREPARE DISCOVERY (Framing)');
  const t0 = performance.now();
  const disc = await callTool('prepare_discovery', {
    brief: topic,
    region: 'Baltic Sea (Riga, Tallinn, Klaipeda ports)',
    exclusions: ['Open ocean operations', 'Manned crew requirements'],
    depth: 'standard'
  });
  const t1 = performance.now();
  const stage1Ms = (t1 - t0).toFixed(2);
  stages.push({ stage: '1_prepare_discovery', durationMs: stage1Ms });
  console.log(`  ✓ Output: ${disc.content[0].text}`);
  console.log(`  ⏱ Latency: ${stage1Ms} ms\n`);

  // -------------------------------------------------------------
  // STAGE 2: GENERATE PERSONAS (Stakeholder Cohort)
  // -------------------------------------------------------------
  console.log('▶ [Stage 2/5] GENERATE PERSONAS (Stakeholder Exploration)');
  const t2 = performance.now();
  const personas = await callTool('generate_personas', {
    brief: `Synthetic stakeholder personas for ${topic}`,
    depth: 'standard',
    stakeholders: [
      {
        id: 'harbor_master',
        label: 'Harbor Master',
        description: 'Supervises commercial vessel traffic and harbor fairway cleanliness',
        participants: 2,
        countryCode: 'LV',
        locality: 'Riga'
      },
      {
        id: 'environmental_auditor',
        label: 'Marine Environmental Inspector',
        description: 'Monitors microplastics and floating debris compliance under Baltic Sea standards',
        participants: 1,
        countryCode: 'EE',
        locality: 'Tallinn'
      }
    ]
  });
  const t3 = performance.now();
  const stage2Ms = (t3 - t2).toFixed(2);
  stages.push({ stage: '2_generate_personas', durationMs: stage2Ms });
  console.log(`  ✓ Output: ${personas.content[0].text}`);
  console.log(`  ⏱ Latency: ${stage2Ms} ms\n`);

  // -------------------------------------------------------------
  // STAGE 3: SIMULATE INTERVIEWS (OCEAN Simulation)
  // -------------------------------------------------------------
  console.log('▶ [Stage 3/5] SIMULATE INTERVIEWS (Deterministic OCEAN Simulation)');
  const t4 = performance.now();
  const sim = await callTool('simulate_interviews', {
    scenario: 'Autonomous debris skimming in high-traffic harbor fairways during Baltic summer watercraft activity',
    targetAudience: 'Port authority operators, maritime safety officers',
    problem: 'Debris collisions with pleasure craft and automated navigational hazard avoidance',
    stakeholders: [
      {
        id: 'harbor_master',
        label: 'Harbor Master',
        description: 'Supervises fairway safety',
        questions: [
          'How does the skimmer boat identify floating debris vs navigation buoys?',
          'What happens when battery capacity drops below safe return threshold in a commercial channel?'
        ],
        participants: 2,
        countryCode: 'LV',
        locality: 'Riga'
      }
    ],
    seed: 42,
    responseStyle: 'realistic'
  });
  const t5 = performance.now();
  const stage3Ms = (t5 - t4).toFixed(2);
  stages.push({ stage: '3_simulate_interviews', durationMs: stage3Ms });
  console.log(`  ✓ Output: ${sim.content[0].text}`);
  console.log(`  ⏱ Latency: ${stage3Ms} ms\n`);

  // -------------------------------------------------------------
  // STAGE 4: ANALYZE INTERVIEWS (Qualitative Thematic Synthesis)
  // -------------------------------------------------------------
  console.log('▶ [Stage 4/5] ANALYZE INTERVIEWS (Qualitative Synthesis & Gap Contract)');
  const t6 = performance.now();
  const analysis = await callTool('analyze_interviews', {
    decisionQuestion: 'What are the essential sensor fail-safes and regulatory barriers for autonomous skimmers in Baltic harbors?',
    depth: 'standard',
    outputs: ['jobs_pains'],
    views: ['themes', 'insights']
  });
  const t7 = performance.now();
  const stage4Ms = (t7 - t6).toFixed(2);
  stages.push({ stage: '4_analyze_interviews', durationMs: stage4Ms });
  console.log(`  ✓ Output: ${analysis.content[0].text}`);
  console.log(`  ⏱ Latency: ${stage4Ms} ms\n`);

  // -------------------------------------------------------------
  // STAGE 5: CREATE PRD (Evidence-Linked Specifications)
  // -------------------------------------------------------------
  console.log('▶ [Stage 5/5] CREATE PRD (Evidence-Linked Product Requirements Document)');
  const t8 = performance.now();
  const prd = await callTool('create_prd', {
    brief: 'Autonomous solar harbor cleaning boat featuring LiDAR-based obstacle detection, real-time debris collection metrics, and solar recharging dock integration.',
    artifactType: 'software_prd',
    depth: 'standard',
    sources: [
      {
        id: 'src-helcom-1',
        title: 'HELCOM Baltic Sea Marine Litter Action Plan',
        text: 'Autonomous surface vessels operating in Baltic ports must maintain AIS transponder broadcasting and 360-degree situational awareness.',
        origin: 'supplied_document'
      }
    ]
  });
  const t9 = performance.now();
  const stage5Ms = (t9 - t8).toFixed(2);
  stages.push({ stage: '5_create_prd', durationMs: stage5Ms });
  console.log(`  ✓ Output: ${prd.content[0].text}`);
  console.log(`  ⏱ Latency: ${stage5Ms} ms\n`);

  const totalPipelineMs = (performance.now() - startAll).toFixed(2);

  // Save report
  const reportDir = 'deliverables/axwise-v0.4.2';
  await mkdir(reportDir, { recursive: true });
  await writeFile(
    join(reportDir, 'e2e-discovery-pipeline-run.json'),
    JSON.stringify({
      topic,
      status: 'completed',
      engine: 'axwise-rust-v0.4.2',
      totalDurationMs: parseFloat(totalPipelineMs),
      stages
    }, null, 2)
  );

  console.log('================================================================');
  console.log(`🎉 FULL E2E DISCOVERY PIPELINE PASSED IN ${totalPipelineMs} ms TOTAL!`);
  console.log('================================================================');

  child.stdin.end();
  child.kill();
  process.exit(0);
}

run().catch(err => {
  console.error('Pipeline failed:', err);
  child.kill();
  process.exit(1);
});
