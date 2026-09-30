import assert from 'node:assert/strict';
import {test} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {describeJob} from '../src/jobs.ts';
import {traceSummary} from '../src/plugins/index.ts';
import {record0} from '../src/catalog/record0.ts';

test('end-to-end propagation through app handle', () => {
  const job = {requestId: 'job-xyz-789', name: 'data-sync'};
  const result = handle('trace-abc-123', 'user-456', job);

  // Context contains traceId and userId, and no requestId property
  assert.equal(result.context.traceId, 'trace-abc-123');
  assert.equal(result.context.userId, 'user-456');
  assert.equal('requestId' in result.context, false);
  assert.equal(result.context.requestId, undefined);

  // Wire headers
  assert.equal(result.headers['x-request-id'], 'trace-abc-123');

  // Logs output preserves wire key requestId mapped to traceId
  assert.equal(result.logs.requestId, 'trace-abc-123');
  assert.equal(result.logs.userId, 'user-456');

  // Response body preserves wire key requestId mapped to traceId
  assert.equal(result.body.requestId, 'trace-abc-123');

  // Payload reflects worker fork with suffix and propagation into describeJob
  assert.equal(result.body.payload.trace, 'trace-abc-123/worker');

  // Unrelated Job.requestId is preserved and not overwritten by traceId
  assert.equal(result.body.payload.requestId, 'job-xyz-789');
  assert.equal(result.body.payload.audit, 'job:job-xyz-789');
  assert.equal(result.body.payload.name, 'data-sync');

  // Original context non-mutation verification
  assert.equal(result.context.traceId, 'trace-abc-123');
});

test('context factory and non-mutation behavior', () => {
  const ctx = createContext('root-trace', 'user-1');
  assert.equal(ctx.traceId, 'root-trace');
  assert.equal(ctx.userId, 'user-1');
  assert.equal('requestId' in ctx, false);

  const forked = forkContext(ctx, 'stage1');
  assert.equal(forked.traceId, 'root-trace/stage1');
  assert.equal(forked.userId, 'user-1');
  assert.equal(ctx.traceId, 'root-trace');

  const forked2 = forkContext(forked, 'stage2');
  assert.equal(forked2.traceId, 'root-trace/stage1/stage2');
  assert.equal(forked.traceId, 'root-trace/stage1');
});

test('unrelated Job identifier in describeJob', () => {
  const ctx = createContext('trace-test', 'user-2');
  const job = {requestId: 'job-unique-id', name: 'index-task'};
  const desc = describeJob(job, ctx);

  assert.equal(desc.requestId, 'job-unique-id');
  assert.equal(desc.trace, 'trace-test');
  assert.equal(desc.audit, 'job:job-unique-id');
  assert.equal(desc.name, 'index-task');
});

test('traceSummary in plugins and its consumers', () => {
  const ctx = createContext('summary-trace-001', 'user-summary');
  const summary = traceSummary(ctx);

  assert.equal(Array.isArray(summary), true);
  assert.equal(summary.length, 8);
  for (let i = 0; i < 8; i++) {
    assert.equal(summary[i].requestId, 'summary-trace-001');
    assert.equal(summary[i].tag, `plugin${i}`);
    assert.equal(summary[i].user, 'user-summary');
  }
});

test('unrelated catalog RequestContext and requestId preserved', () => {
  const catalogCtx = {requestId: 'cat-req-42', category: 'books'};
  const res = record0(catalogCtx);
  assert.equal(res.requestId, 'cat-req-42');
  assert.equal(res.category, 'books');
  assert.equal(res.label, 'record0:cat-req-42');
});
