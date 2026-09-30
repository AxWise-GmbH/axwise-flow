import fs from 'node:fs';

function loadEnvFile(path) {
  if (!fs.existsSync(path)) return;
  const content = fs.readFileSync(path, 'utf8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (trimmed && !trimmed.startsWith('#') && trimmed.includes('=')) {
      const [k, ...rest] = trimmed.split('=');
      const val = rest.join('=').trim().replace(/^['"]|['"]$/g, '');
      if (!process.env[k.trim()]) {
        process.env[k.trim()] = val;
      }
    }
  }
}

loadEnvFile('.env.local');
loadEnvFile('.env');

const TYPESAFE_ENDPOINT = 'https://api.typesafe.ai/v1/systemone';
const TYPESAFE_API_KEY = process.env.TYPESAFE_API_KEY;

if (!TYPESAFE_API_KEY) {
  console.error('Missing TYPESAFE_API_KEY');
  process.exit(1);
}

const TAB_WORKLOADS = [
  {
    tabId: 'tab_1_quantum',
    title: 'Tab 1: Quantum Computing Navigation',
    goal: 'Navigate from Quantum computing towards Computer',
    currentPage: 'Quantum computing',
    targetPage: 'Computer',
    candidates: {
      act_1: 'Superposition (physics)',
      act_2: 'Qubit (information theory)',
      act_3: 'Computer science (computation)',
      act_4: 'Shor algorithm (cryptography)',
      act_5: 'Quantum supremacy (milestone)',
    },
    expectedTarget: 'act_3',
  },
  {
    tabId: 'tab_2_photosynthesis',
    title: 'Tab 2: Photosynthesis Navigation',
    goal: 'Navigate from Photosynthesis towards Sun',
    currentPage: 'Photosynthesis',
    targetPage: 'Sun',
    candidates: {
      act_1: 'Chloroplast (plant cell)',
      act_2: 'Sunlight (solar radiation)',
      act_3: 'Glucose (chemical energy)',
      act_4: 'Carbon dioxide (atmospheric gas)',
      act_5: 'Calvin cycle (biochemical phase)',
    },
    expectedTarget: 'act_2',
  },
  {
    tabId: 'tab_3_davinci',
    title: 'Tab 3: Leonardo da Vinci Navigation',
    goal: 'Navigate from Leonardo da Vinci towards Art',
    currentPage: 'Leonardo da Vinci',
    targetPage: 'Art',
    candidates: {
      act_1: 'Mona Lisa (painting)',
      act_2: 'Renaissance (historical era)',
      act_3: 'Visual arts (creative discipline)',
      act_4: 'Florence (Italian city)',
      act_5: 'Vitruvian Man (drawing)',
    },
    expectedTarget: 'act_3',
  },
  {
    tabId: 'tab_4_checkout',
    title: 'Tab 4: E-Commerce Multi-Step Cart',
    goal: 'Advance from review step to finalize payment and complete order',
    currentPage: 'Checkout Review',
    targetPage: 'Order Confirmation',
    candidates: {
      act_1: 'Button: Edit Shipping Address',
      act_2: 'Button: Apply Promo Code',
      act_3: 'Button: Complete Order & Pay ($149.00)',
      act_4: 'Link: Return to Cart',
      act_5: 'Checkbox: Subscribe to Newsletter',
    },
    expectedTarget: 'act_3',
  },
  {
    tabId: 'tab_5_analytics',
    title: 'Tab 5: Analytics Metric Filter',
    goal: 'Filter time range to Last 30 Days',
    currentPage: 'SaaS Metric Dashboard',
    targetPage: 'Filtered Dashboard',
    candidates: {
      act_1: 'Dropdown: Today (Last 24h)',
      act_2: 'Dropdown: Last 7 Days',
      act_3: 'Dropdown: Last 30 Days',
      act_4: 'Button: Export CSV',
      act_5: 'Button: Refresh Query',
    },
    expectedTarget: 'act_3',
  },
];

async function evaluateTabWorkload(tab) {
  const started = performance.now();
  const payload = {
    model: 'jev-latest',
    state: {
      goal: tab.goal,
      current_page: tab.currentPage,
      target_page: tab.targetPage,
    },
    questions: {
      target_action: {
        type: 'choice',
        instructions: 'Select the optimal action candidate to advance toward the goal.',
        criteria: tab.candidates,
      },
    },
  };

  const res = await fetch(TYPESAFE_ENDPOINT, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${TYPESAFE_API_KEY}`,
    },
    body: JSON.stringify(payload),
  });

  const latencyMs = Math.round(performance.now() - started);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }

  const data = await res.json();
  const answer = data.answers?.target_action;

  return {
    tabId: tab.tabId,
    title: tab.title,
    choice: answer?.choice,
    confidence: answer?.confidence,
    probabilities: answer?.probabilities,
    expected: tab.expectedTarget,
    accurate: answer?.choice === tab.expectedTarget,
    latencyMs,
    inputTokens: data.usage?.input_tokens || 0,
    outputTokens: data.usage?.output_tokens || 0,
  };
}

console.log('=== Running Multi-Tab Navigation Benchmark (Sequential & Parallel) ===\n');

// 1. Sequential Run
console.log('--- Phase 1: Sequential Tab Execution ---');
const sequentialResults = [];
for (const tab of TAB_WORKLOADS) {
  const res = await evaluateTabWorkload(tab);
  sequentialResults.push(res);
  console.log(
    `[${res.tabId}] ${res.title} -> Chosen: ${res.choice} (${(res.confidence * 100).toFixed(1)}%) in ${res.latencyMs}ms [${res.accurate ? 'MATCH' : 'DIFF'}]`
  );
}

// 2. Parallel Burst Run (simulating 5 concurrent tabs evaluating simultaneously)
console.log('\n--- Phase 2: Parallel Concurrent Tab Burst ---');
const parallelStart = performance.now();
const parallelResults = await Promise.all(TAB_WORKLOADS.map(evaluateTabWorkload));
const parallelTotalMs = Math.round(performance.now() - parallelStart);

for (const res of parallelResults) {
  console.log(
    `[PARALLEL ${res.tabId}] Chosen: ${res.choice} (${(res.confidence * 100).toFixed(1)}%) in ${res.latencyMs}ms`
  );
}

const avgSeqLatency = Math.round(
  sequentialResults.reduce((a, r) => a + r.latencyMs, 0) / sequentialResults.length
);
const avgParLatency = Math.round(
  parallelResults.reduce((a, r) => a + r.latencyMs, 0) / parallelResults.length
);
const totalAccuracy = `${parallelResults.filter(r => r.accurate).length}/${parallelResults.length}`;

const report = {
  summary: {
    totalTabsTested: TAB_WORKLOADS.length,
    accuracy: totalAccuracy,
    avgSequentialLatencyMs: avgSeqLatency,
    avgParallelLatencyMs: avgParLatency,
    parallelBurstWallClockMs: parallelTotalMs,
    throughputTabsPerSecond: Number(
      ((TAB_WORKLOADS.length / parallelTotalMs) * 1000).toFixed(2)
    ),
  },
  sequentialResults,
  parallelResults,
};

fs.writeFileSync(
  'docs/benchmark-multi-tab-workload-report.json',
  JSON.stringify(report, null, 2)
);

console.log('\n=== Multi-Tab Benchmark Summary ===');
console.log(`Accuracy: ${totalAccuracy}`);
console.log(`Average Latency per Tab: ${avgSeqLatency}ms`);
console.log(`Parallel Burst Wall Time: ${parallelTotalMs}ms for ${TAB_WORKLOADS.length} concurrent tabs`);
console.log(`Throughput: ${report.summary.throughputTabsPerSecond} tab decisions/sec`);
console.log('Saved report to docs/benchmark-multi-tab-workload-report.json\n');
