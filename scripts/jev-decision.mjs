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
  console.error(JSON.stringify({ error: 'Missing TYPESAFE_API_KEY' }));
  process.exit(1);
}

const inputChunks = [];
for await (const chunk of process.stdin) {
  inputChunks.push(chunk);
}
const rawInput = Buffer.concat(inputChunks).toString('utf8');
const { goal, currentPage, targetPage, candidates } = JSON.parse(rawInput);

const criteria = {};
for (const c of candidates) {
  criteria[c.id] = `${c.text} (${c.href.replace('https://en.wikipedia.org/wiki/', '').replace('/wiki/', '')})`;
}

const payload = {
  model: 'jev-latest',
  state: {
    goal,
    current_page: currentPage,
    target_page: targetPage,
  },
  questions: {
    target_action: {
      type: 'choice',
      instructions: 'Select the single link candidate that gets closest to the target topic.',
      criteria,
    },
  },
};

const started = performance.now();
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
  console.error(JSON.stringify({ error: `JEV HTTP ${res.status}`, latencyMs }));
  process.exit(1);
}

const data = await res.json();
const answer = data.answers?.target_action;
console.log(
  JSON.stringify({
    chosenId: answer?.choice,
    confidence: answer?.confidence,
    latencyMs,
    probabilities: answer?.probabilities,
    usage: data.usage,
  })
);
