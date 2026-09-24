#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

const DISCOVERY_TOOLS = new Set(['list_functions', 'get_function_details']);
const USAGE_FIELDS = ['inputTokens', 'outputTokens', 'totalTokens', 'cacheReadTokens', 'cacheWriteTokens', 'elapsedMs', 'timeToFirstTokenMs'];

export function parseOptions(args) {
  const options = {};
  for (let i = 0; i < args.length; i += 2) {
    const key = args[i];
    if (!['--db', '--session'].includes(key) || !args[i + 1] || args[i + 1].startsWith('--'))
      throw new Error('Usage: node scripts/profile-desktop-spans.mjs --db SESSION_DB --session SESSION_ID');
    if (options[key.slice(2)] !== undefined) throw new Error(`Duplicate option ${key}`);
    options[key.slice(2)] = args[i + 1];
  }
  if (!options.db || !/^[A-Za-z0-9_-]{1,128}$/.test(options.session || ''))
    throw new Error('A database path and an alphanumeric session ID are required.');
  return { db: resolve(options.db), session: options.session };
}

/** Read only shape, IDs, provider names, and numeric usage—not prompts, tool arguments or results. */
export function readSessionMetadata({ db, session }, run = spawnSync) {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(session || '')) throw new Error('Invalid session ID.');
  const query = `SELECT m.id, m.role, m.created_timestamp,
    json_extract(m.metadata_json, '$.turnContext') AS turnContext,
    json_extract(m.metadata_json, '$.userVisible') AS userVisible,
    json_extract(m.metadata_json, '$.inference.provider') AS provider,
    json_extract(m.metadata_json, '$.inference.requestedModel') AS model,
    ${USAGE_FIELDS.map((key) => `json_extract(m.metadata_json, '$.usage.${key}') AS ${key}`).join(',\n    ')},
    (SELECT json_group_array(json_object(
      'type', json_extract(j.value, '$.type'),
      'tool', json_extract(j.value, '$.toolCall.value.name'),
      'callId', json_extract(j.value, '$.id')))
      FROM json_each(m.content_json) AS j) AS parts
    FROM messages AS m WHERE m.session_id = '${session}' ORDER BY m.id;`;
  const result = run('sqlite3', ['-readonly', '-json', resolve(db), query], {
    encoding: 'utf8', maxBuffer: 32 * 1024 * 1024, timeout: 15_000,
  });
  if (result.error || result.status !== 0) throw new Error('Could not read desktop usage metadata.');
  return JSON.parse(result.stdout || '[]').map((row) => ({ ...row, parts: JSON.parse(row.parts || '[]') }));
}

const numeric = (value) => typeof value === 'number' && Number.isFinite(value) && value >= 0;

function summarize(records) {
  const sumReported = (key) => {
    const reported = records.filter((record) => numeric(record[key]));
    return { value: reported.length ? reported.reduce((sum, record) => sum + record[key], 0) : null,
      reportedRecords: reported.length, totalRecords: records.length };
  };
  const readCoverage = records.filter((record) => numeric(record.cacheReadTokens) && numeric(record.inputTokens));
  const readInput = readCoverage.reduce((sum, record) => sum + record.inputTokens, 0);
  return {
    providerUsageRecords: records.length,
    elapsedMs: sumReported('elapsedMs'),
    inputTokens: sumReported('inputTokens'), outputTokens: sumReported('outputTokens'),
    cacheReadTokens: sumReported('cacheReadTokens'), cacheWriteTokens: sumReported('cacheWriteTokens'),
    cacheReadShareOfReportedInput: readInput ? readCoverage.reduce((sum, record) => sum + record.cacheReadTokens, 0) / readInput : null,
    inputTokensWithKnownCacheRead: readInput,
  };
}

export function profileSession(rows, session) {
  const turns = [];
  let current;
  for (const row of rows) {
    const parts = Array.isArray(row.parts) ? row.parts : [];
    const types = parts.map((part) => part.type);
    const userTurn = row.role === 'user' && row.userVisible !== false && row.userVisible !== 0 && !row.turnContext
      && !types.includes('toolResponse') && types.some((type) => ['text', 'image', 'audio'].includes(type));
    if (userTurn) {
      current = { turn: turns.length + 1, userMessageId: row.id, providerSpans: [], toolRequests: [], toolResponses: [] };
      turns.push(current);
    }
    if (!current) continue;
    const requests = parts.filter((part) => part.type === 'toolRequest');
    current.toolRequests.push(...requests.map((part) => ({ messageId: row.id, callId: part.callId, tool: part.tool })));
    current.toolResponses.push(...parts.filter((part) => part.type === 'toolResponse').map((part) => ({ messageId: row.id, callId: part.callId })));
    if (row.role !== 'assistant' || !USAGE_FIELDS.some((key) => numeric(row[key]))) continue;
    const names = requests.map((part) => part.tool);
    const bareNames = names.map((name) => typeof name === 'string' ? name.split('__').at(-1) : '');
    current.providerSpans.push({
      messageId: row.id,
      provider: row.provider ?? null, model: row.model ?? null,
      phase: names.length
        ? bareNames.every((name) => DISCOVERY_TOOLS.has(name)) ? 'host_discovery_decision' : 'host_tool_selection_and_arguments'
        : types.includes('text') ? 'host_text_generation' : 'host_other_generation',
      tools: names,
      ...Object.fromEntries(USAGE_FIELDS.map((key) => [key, numeric(row[key]) ? row[key] : null])),
    });
  }
  for (const turn of turns) {
    const last = turn.providerSpans.at(-1);
    if (last?.phase === 'host_text_generation')
      last.phase = turn.toolResponses.some((response) => response.messageId < last.messageId)
        ? 'host_final_summary_candidate' : 'host_final_answer_candidate';
    turn.summary = summarize(turn.providerSpans);
  }
  const records = turns.flatMap((turn) => turn.providerSpans);
  return {
    schemaVersion: 'desktop-provider-spans.v1', sessionId: session, turns,
    summary: summarize(records),
    phases: Object.fromEntries([...new Set(records.map((record) => record.phase))]
      .map((phase) => [phase, summarize(records.filter((record) => record.phase === phase))])),
    measurementNotes: [
      'elapsedMs and timeToFirstTokenMs are recorded provider-call measurements, not turn wall time or local tool execution time.',
      'Phase names are inferred from emitted tool/message shape; a text-only answer after tools is only a summary candidate, not proof of faithful summarization.',
      'Discovery decision time measures model latency to request metadata, not extension catalog fetch latency. Selection includes planning and argument generation.',
      'Tool-response message timestamps may equal request creation timestamps. They are deliberately not used as execution durations; use tool runtime metrics and UI approval intervals separately.',
      'Cache counts are provider-reported prompt-token reuse, not Axwise artifact replay, extension metadata caching or saved outputs. Missing counts remain unknown, not zero.',
      'Aggregate duration sums recorded calls and is not an end-to-end wall-time measurement. Final candidates assume the captured turn has finished.',
      'Only assistant messages with numeric usage metadata are represented; failed/cancelled requests without usage are not measured by this report.',
      'Turn grouping assumes serial completed user turns; queued or overlapping/steered conversations need separate event-level attribution.',
    ],
  };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  try {
    const options = parseOptions(process.argv.slice(2));
    process.stdout.write(`${JSON.stringify(profileSession(readSessionMetadata(options), options.session), null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
