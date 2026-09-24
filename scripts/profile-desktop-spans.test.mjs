import test from 'node:test';
import assert from 'node:assert/strict';
import { parseOptions, profileSession, readSessionMetadata } from './profile-desktop-spans.mjs';

const user = (id) => ({ id, role: 'user', parts: [{ type: 'text' }] });
const assistant = (id, parts, usage = {}) => ({ id, role: 'assistant', parts, ...usage });
const tool = (name, callId) => ({ type: 'toolRequest', tool: name, callId });

test('profiles measured provider metadata with explicitly inferred phases, not timestamp-based tool times', () => {
  const result = profileSession([
    user(1), { ...user(2), turnContext: true, userVisible: 0 },
    assistant(3, [tool('code_execution__list_functions', 'a')], { elapsedMs: 100, inputTokens: 500 }),
    { id: 4, role: 'user', parts: [{ type: 'toolResponse', callId: 'a' }] },
    assistant(5, [tool('execute_typescript', 'b')], { elapsedMs: 400, cacheReadTokens: 300, inputTokens: 600 }),
    { id: 6, role: 'user', parts: [{ type: 'toolResponse', callId: 'b' }] },
    assistant(7, [{ type: 'text' }], { elapsedMs: 200, cacheReadTokens: 0, inputTokens: 600 }),
    user(8), assistant(9, [{ type: 'text' }], { elapsedMs: 90 }),
  ], 'fixture');
  assert.equal(result.turns.length, 2);
  assert.deepEqual(result.turns[0].providerSpans.map((span) => span.phase), [
    'host_discovery_decision', 'host_tool_selection_and_arguments', 'host_final_summary_candidate',
  ]);
  assert.equal(result.turns[1].providerSpans[0].phase, 'host_final_answer_candidate');
  assert.equal(result.summary.elapsedMs.value, 790);
  assert.deepEqual(result.summary.cacheReadTokens, { value: 300, reportedRecords: 2, totalRecords: 4 });
  assert.deepEqual(result.summary.cacheWriteTokens, { value: null, reportedRecords: 0, totalRecords: 4 });
  assert.equal(result.summary.cacheReadShareOfReportedInput, 0.25);
  assert.equal(result.turns[0].toolRequests[1].tool, 'execute_typescript');
  assert.equal(result.turns[0].toolResponses[0].durationMs, undefined);
});

test('keeps intermediate narration and mixed discovery/execution distinct', () => {
  const result = profileSession([user(1),
    assistant(2, [{ type: 'text' }], { elapsedMs: 10 }),
    assistant(3, [tool('get_function_details', 'a'), tool('developer__shell', 'b')], { elapsedMs: 20 }),
    assistant(4, [{ type: 'text' }], { elapsedMs: 30 }),
  ], 'fixture');
  assert.equal(result.turns[0].providerSpans[0].phase, 'host_text_generation');
  assert.equal(result.turns[0].providerSpans[1].phase, 'host_tool_selection_and_arguments');
});

test('reader is read-only and never selects prompts, arguments, full results, or full metadata', () => {
  const rows = readSessionMetadata({ db: '/tmp/session.db', session: '20260924_1' }, (command, args, options) => {
    assert.equal(command, 'sqlite3');
    assert.deepEqual(args.slice(0, 2), ['-readonly', '-json']);
    const sql = args.at(-1);
    assert.match(sql, /usage.cacheReadTokens/);
    assert.doesNotMatch(sql, /\$\.text|\.arguments|toolResult|SELECT \*/);
    assert.equal(options.timeout, 15_000);
    return { status: 0, stdout: '[{"id":1,"parts":"[]"}]' };
  });
  assert.deepEqual(rows, [{ id: 1, parts: [] }]);
  assert.throws(() => readSessionMetadata({ db: '/tmp/x', session: "x'; DROP TABLE messages;--" }));
});

test('requires an explicit scoped database/session and rejects unknown flags', () => {
  assert.equal(parseOptions(['--db', '/tmp/x', '--session', '20260924_1']).session, '20260924_1');
  for (const args of [[], ['--db', '/tmp/x'], ['--db', '/tmp/x', '--session', '../other'], ['--db', '/tmp/x', '--session', 's', '--db', '/tmp/y'], ['--all', 'true']])
    assert.throws(() => parseOptions(args));
});
