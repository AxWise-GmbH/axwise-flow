/**
 * Pure formatting + shaping helpers for the Assistant Console. No React, no I/O,
 * so they are trivially unit-testable.
 */

function pad(n) {
  return String(n).padStart(2, '0');
}

/**
 * Split an ISO timestamp into the two display lines the Conversation history
 * "Date" column wants: { date: 'dd.mm', time: 'hh:mm:ss' } (local time).
 */
export function formatDateParts(iso) {
  if (!iso) return { date: '--.--', time: '--:--:--' };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: '--.--', time: '--:--:--' };
  return {
    date: `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`,
  };
}

/** "Aurum & P. Jackson" from a thread's sender names + the assistant name. */
export function deriveBetween(senders, assistantName = 'Assistant') {
  const uniq = [...new Set((senders || []).filter(Boolean))];
  if (uniq.length === 0) return assistantName;
  if (uniq.length === 1) {
    return uniq[0] === assistantName ? assistantName : `${assistantName} & ${uniq[0]}`;
  }
  return uniq.join(' & ');
}

/**
 * Collapse raw communication_logs into conversation threads for the table.
 * Groups by thread_id; each row is { id, platform, between, lastMessage, date }.
 * Newest thread first.
 */
export function groupThreads(logs = [], assistantName = 'Assistant') {
  const byThread = new Map();
  for (const log of logs) {
    const key = log.thread_id || log.id;
    if (!key) continue;
    if (!byThread.has(key)) {
      byThread.set(key, {
        id: key,
        platform: log.platform || 'internal',
        senders: new Set(),
        latest: null,
      });
    }
    const t = byThread.get(key);
    if (log.sender_name) t.senders.add(log.sender_name);
    if (log.platform && log.platform !== 'internal') t.platform = log.platform;
    const ts = log.created_at ? new Date(log.created_at).getTime() : 0;
    if (!t.latest || ts >= t.latest._ts) {
      t.latest = { content: log.content || '', created_at: log.created_at || null, _ts: ts };
    }
  }
  return [...byThread.values()]
    .map((t) => ({
      id: t.id,
      platform: t.platform,
      between: deriveBetween([...t.senders], assistantName),
      lastMessage: t.latest?.content || '',
      date: t.latest?.created_at || null,
    }))
    .sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());
}

/** Local YYYY-MM-DD key for a Date (matches the chart's day buckets). */
function dayKey(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Sender types that are the assistant itself - excluded from "sensed" (inbound)
// message counts so the activity chart reflects what the assistant received.
const SELF_SENDERS = new Set(['agent', 'assistant']);

/**
 * Bucket communication_logs into a zero-filled daily count series for the last
 * `days` days (oldest-first), counting "sensed" (inbound) messages - i.e. logs
 * whose sender_type is not the assistant/agent itself. Returns
 * [{ date: 'YYYY-MM-DD', count }]. `now` is injectable for deterministic tests.
 */
export function buildActivitySeries(logs = [], { days = 90, now = Date.now() } = {}) {
  const buckets = new Map();
  // Seed the last `days` days at zero so the chart never has gaps.
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - (days - 1));
  for (let i = 0; i < days; i += 1) {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    buckets.set(dayKey(d), 0);
  }
  for (const log of logs) {
    if (!log?.created_at) continue;
    if (SELF_SENDERS.has(String(log.sender_type || '').toLowerCase())) continue;
    const t = new Date(log.created_at);
    if (Number.isNaN(t.getTime())) continue;
    const key = dayKey(t);
    if (buckets.has(key)) buckets.set(key, buckets.get(key) + 1);
  }
  return [...buckets.entries()].map(([date, count]) => ({ date, count }));
}

/** Relative "x ago" label for KB contributions. `now` is injectable for tests. */
export function formatTimeAgo(iso, now = Date.now()) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const sec = Math.max(0, Math.round((now - t) / 1000));
  if (sec < 60) return 'just now';
  const min = Math.round(sec / 60);
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  if (day < 7) return `${day}d ago`;
  const d = new Date(iso);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

/** Chat-style time: today -> "10:24 AM", yesterday -> "Yesterday", else "dd.mm". */
export function formatChatTime(iso, now = Date.now()) {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  const ref = new Date(now);
  if (d.toDateString() === ref.toDateString()) {
    const ampm = d.getHours() >= 12 ? 'PM' : 'AM';
    const h12 = d.getHours() % 12 || 12;
    return `${h12}:${pad(d.getMinutes())} ${ampm}`;
  }
  const yesterday = new Date(ref);
  yesterday.setDate(ref.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}`;
}

function ownerLabel(ownerType) {
  if (ownerType === 'agent') return 'Agent';
  if (ownerType === 'team') return 'Team';
  if (ownerType === 'partner') return 'Partner';
  return 'You';
}

/** Humanize a knowledge_documents.source (e.g. "notion:abc" -> "Notion"). */
function prettySource(source) {
  if (!source) return 'Manual';
  const s = String(source);
  if (s.toLowerCase().startsWith('notion')) return 'Notion';
  if (s.toLowerCase().includes('obsidian')) return 'Obsidian';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Connectors are inferred from document source/category/tags - there is no
// connector status table. We surface a connector as "connected" when any doc
// originated from it.
const CONNECTOR_DEFS = [
  { id: 'obsidian', name: 'Obsidian', match: 'obsidian' },
  { id: 'notion', name: 'Notion', match: 'notion' },
];

/**
 * Shape knowledge_documents + tags into the Data & Knowledge card model:
 * { counts: { notes, files, links }, connectors[], tags[], tagsMore }.
 */
export function buildKnowledgeData(documents = [], tags = [], maxTags = 6) {
  const counts = { notes: 0, files: 0, links: 0 };
  const blobParts = [];
  for (const d of documents) {
    const type = d.content_type || 'note';
    if (type === 'file') counts.files += 1;
    else if (type === 'link') counts.links += 1;
    else counts.notes += 1;
    blobParts.push(
      `${d.source || ''} ${d.category || ''} ${(d.tags || []).join(' ')}`.toLowerCase()
    );
  }
  const blob = blobParts.join(' ');
  const connectors = CONNECTOR_DEFS.filter((c) => blob.includes(c.match)).map((c) => ({
    id: c.id,
    name: c.name,
    status: 'connected',
  }));
  const tagList = Array.isArray(tags) ? tags : [];
  return {
    counts,
    connectors,
    tags: tagList.slice(0, maxTags),
    tagsMore: Math.max(0, tagList.length - maxTags),
  };
}

/** Shape goal_messages (team-room feed) into { id, author, time, message }[]. */
export function shapeTeamChat(messages = [], now = Date.now()) {
  return (messages || []).map((m) => ({
    id: m.id,
    author: m.sender_name || 'Agent',
    time: formatChatTime(m.created_at, now),
    message: m.message || '',
  }));
}

/**
 * Shape knowledge_documents into the contributions list
 * { id, title, author, source, words, time }[]. Word count is estimated from
 * token_count (~1.3 tokens/word); author falls back to the owner role.
 */
export function shapeContributions(documents = [], now = Date.now()) {
  return (documents || []).map((d) => ({
    id: d.id,
    title: d.title || 'Untitled',
    author: d.metadata?.agent_name || ownerLabel(d.owner_type),
    source: prettySource(d.source),
    words: Math.max(0, Math.round((d.token_count || 0) / 1.3)),
    time: formatTimeAgo(d.created_at, now),
  }));
}

/**
 * Merge several usageService snapshots (one per assistant source) into one
 * { totalTokens, totalCost, models[], timeseries[] } shape for the Usage card.
 */
export function mergeUsageSnapshots(snapshots = []) {
  let totalTokens = 0;
  let totalCost = 0;
  const modelMap = new Map();
  const dateMap = new Map();
  for (const s of snapshots) {
    if (!s) continue;
    totalTokens += s.totals?.tokens || 0;
    totalCost += s.totals?.cost || 0;
    for (const m of s.byModel || []) {
      const cur = modelMap.get(m.model) || { model: m.model, tokens: 0, cost: 0 };
      cur.tokens += m.tokens || 0;
      cur.cost += m.cost || 0;
      modelMap.set(m.model, cur);
    }
    for (const t of s.timeseries || []) {
      const cur = dateMap.get(t.date) || { date: t.date, tokens: 0, cost: 0 };
      cur.tokens += t.tokens || 0;
      cur.cost += t.cost || 0;
      dateMap.set(t.date, cur);
    }
  }
  const denom = totalTokens || 1;
  const models = [...modelMap.values()]
    .sort((a, b) => b.tokens - a.tokens)
    .map((m) => ({ ...m, pct: Math.round((m.tokens / denom) * 100) }));
  const timeseries = [...dateMap.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  return { totalTokens, totalCost, models, timeseries };
}
