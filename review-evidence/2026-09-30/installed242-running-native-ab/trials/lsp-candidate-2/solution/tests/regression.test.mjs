import assert from 'node:assert/strict';
import {test} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {describeJob} from '../src/jobs.ts';
import {headers} from '../src/middleware.ts';
import {logFields} from '../src/logging.ts';
import {response} from '../src/response.ts';
import {work} from '../src/worker.ts';
import {traceSummary} from '../src/plugins/index.ts';
import {record0, audit0} from '../src/catalog/record0.ts';

test('end-to-end propagation across all stages', () => {
  const trace = 'trace-abc-123';
  const user = 'user-xyz-789';
  const job = {requestId: 'job-id-456', name: 'process-data'};

  const result = handle(trace, user, job);

  // Context contains traceId and userId, but not requestId
  assert.equal(result.context.traceId, trace);
  assert.equal(result.context.userId, user);
  assert.equal('requestId' in result.context, false);
  assert.equal(result.context.requestId, undefined);

  // Headers retain wire key x-request-id with trace value
  assert.deepEqual(result.headers, {'x-request-id': trace});

  // Logs retain output key requestId with trace value
  assert.deepEqual(result.logs, {requestId: trace, userId: user});

  // Response wire/output key requestId matches root trace
  assert.equal(result.body.requestId, trace);

  // Forked context in worker propagates trace with suffix
  assert.equal(result.body.payload.trace, `${trace}/worker`);

  // Unrelated Job identifier and audit are preserved in payload
  assert.equal(result.body.payload.requestId, job.requestId);
  assert.equal(result.body.payload.audit, `job:${job.requestId}`);
  assert.equal(result.body.payload.name, job.name);
});

test('unrelated Job.requestId is preserved and distinct from context.traceId', () => {
  const ctx = createContext('ctx-trace-1', 'user-1');
  const job = {requestId: 'job-req-999', name: 'custom-job'};

  const jobDesc = describeJob(job, ctx);
  assert.equal(jobDesc.requestId, 'job-req-999');
  assert.equal(jobDesc.trace, 'ctx-trace-1');
  assert.equal(jobDesc.audit, 'job:job-req-999');
  assert.equal(jobDesc.name, 'custom-job');

  const workDesc = work(ctx, job);
  assert.equal(workDesc.requestId, 'job-req-999');
  assert.equal(workDesc.trace, 'ctx-trace-1/worker');
  assert.equal(workDesc.audit, 'job:job-req-999');
});

test('forkContext non-mutation and suffix behavior', () => {
  const root = createContext('root-trace', 'user-root');
  const child = forkContext(root, 'worker');
  const grandChild = forkContext(child, 'step2');

  // Non-mutation
  assert.equal(root.traceId, 'root-trace');
  assert.equal('requestId' in root, false);

  // Child has suffix
  assert.equal(child.traceId, 'root-trace/worker');
  assert.equal(child.userId, 'user-root');
  assert.equal('requestId' in child, false);

  // Grandchild has chained suffixes
  assert.equal(grandChild.traceId, 'root-trace/worker/step2');
  assert.equal(grandChild.userId, 'user-root');
});

test('plugins and traceSummary consume RequestContext with traceId', () => {
  const ctx = createContext('trace-plug', 'user-plug');
  const summary = traceSummary(ctx);

  assert.equal(summary.length, 8);
  for (let i = 0; i < 8; i++) {
    assert.deepEqual(summary[i], {
      requestId: 'trace-plug',
      tag: `plugin${i}`,
      user: 'user-plug'
    });
  }
});

test('catalog modules remain isolated and preserve their own RequestContext and requestId', () => {
  const catCtx = {requestId: 'cat-req-123', category: 'books'};
  const recordResult = record0(catCtx);
  assert.deepEqual(recordResult, {
    requestId: 'cat-req-123',
    category: 'books',
    label: 'record0:cat-req-123'
  });
  assert.equal(audit0('cat-req-123'), 'audit0:cat-req-123');
});
