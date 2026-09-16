/**
 * Local dev server for Vercel API routes (uses app + ops + agent cores).
 * Proxies /api/* to api/app.js, api/ops.js, or api/agent.js with query.path so behavior matches Vercel rewrites.
 */
import 'dotenv/config';
import express from 'express';

let appHandler, opsHandler, agentHandler;

try {
  appHandler = (await import('../api/app.js')).default;
} catch (e) {
  console.error('[server] Failed to load app handler:', e.message);
  appHandler = (_req, res) => res.status(500).json({ error: 'app handler failed to load' });
}

try {
  opsHandler = (await import('../api/ops.js')).default;
} catch (e) {
  console.error('[server] Failed to load ops handler:', e.message);
  opsHandler = (_req, res) => res.status(500).json({ error: 'ops handler failed to load' });
}

try {
  agentHandler = (await import('../api/agent.js')).default;
} catch (e) {
  console.error('[server] Failed to load agent handler:', e.message);
  agentHandler = (_req, res) => res.status(500).json({ error: 'agent handler failed to load' });
}

function withPath(path) {
  return (req, res) => {
    const q = { ...(req.query || {}), path };
    const wrapped = { ...req, query: q };
    return appHandler(wrapped, res);
  };
}

function withOpsPath(path) {
  return (req, res) => {
    const q = { ...(req.query || {}), path };
    const wrapped = { ...req, query: q };
    return opsHandler(wrapped, res);
  };
}

function withAgentPath(path) {
  return (req, res) => {
    const q = { ...(req.query || {}), path };
    const wrapped = { ...req, query: q, headers: req.headers || {} };
    return agentHandler(wrapped, res);
  };
}

const app = express();
const PORT = Number(process.env.TRANSCRIBE_PORT) || 3001;

app.use(express.json({ limit: '8mb' }));

// App core routes
app.options('/api/health', withPath('health'));
app.get('/api/health', withPath('health'));
app.options('/api/send-email', withPath('send-email'));
app.post('/api/send-email', withPath('send-email'));
app.options('/api/send-notification', withPath('send-notification'));
app.post('/api/send-notification', withPath('send-notification'));
app.options('/api/request-password-reset', withPath('request-password-reset'));
app.post('/api/request-password-reset', withPath('request-password-reset'));
app.options('/api/invite-user', withPath('invite-user'));
app.get('/api/invite-user', withPath('invite-user'));
app.post('/api/invite-user', withPath('invite-user'));
app.delete('/api/invite-user', withPath('invite-user'));
app.options('/api/public-book', withPath('public-book'));
app.post('/api/public-book', withPath('public-book'));
app.options('/api/public-availability', withPath('public-availability'));
app.get('/api/public-availability', withPath('public-availability'));
app.options('/api/transcribe', withPath('transcribe'));
app.get('/api/transcribe', withPath('transcribe'));
app.post('/api/transcribe', withPath('transcribe'));
app.get('/api/transcribe-status', (req, res) => withPath('transcribe')({ ...req, method: 'GET' }, res));
app.options('/api/ai-analyze-partners', withPath('ai-analyze-partners'));
app.all('/api/ai-analyze-partners', withPath('ai-analyze-partners'));
app.options('/api/backup-database', withPath('backup-database'));
app.all('/api/backup-database', withPath('backup-database'));

// Ops core routes
app.options('/api/data-topology', withOpsPath('data-topology'));
app.get('/api/data-topology', withOpsPath('data-topology'));
app.options('/api/reports', withOpsPath('reports'));
app.get('/api/reports', withOpsPath('reports'));
app.options('/api/report-ingest', withOpsPath('report-ingest'));
app.get('/api/report-ingest', withOpsPath('report-ingest'));
app.post('/api/report-ingest', withOpsPath('report-ingest'));
app.delete('/api/report-ingest', withOpsPath('report-ingest'));
app.options('/api/campaigns', withOpsPath('campaigns'));
app.get('/api/campaigns', withOpsPath('campaigns'));

// Agent core (enqueue → 202; status poll)
app.options('/api/agent/enqueue', withAgentPath('enqueue'));
app.post('/api/agent/enqueue', withAgentPath('enqueue'));
app.options('/api/agent/status', withAgentPath('status'));
app.get('/api/agent/status', withAgentPath('status'));
app.options('/api/agent/process-next', withAgentPath('process-next'));
app.post('/api/agent/process-next', withAgentPath('process-next'));

app.listen(PORT, () => {
  const groq = !!process.env.GROQ_API_KEY;
  const assembly = !!process.env.ASSEMBLYAI_API_KEY;
  console.log(`[server] http://localhost:${PORT} — app + ops + agent cores`);
  console.log(`[server] /api/health, /api/agent/enqueue, /api/agent/status, /api/campaigns, etc.`);
  if (groq) console.log('[server] GROQ_API_KEY set — Groq Whisper + Groq LLM (primary)');
  if (assembly) console.log('[server] ASSEMBLYAI_API_KEY set — AssemblyAI (fallback)');
  if (!groq && !assembly) console.log('[server] WARNING: Add GROQ_API_KEY to .env for transcription');
});
