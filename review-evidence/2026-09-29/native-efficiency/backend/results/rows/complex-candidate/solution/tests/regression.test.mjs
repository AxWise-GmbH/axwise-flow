import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {describeJob} from '../src/jobs.ts';
import {auditLabel} from '../src/job-types.ts';
import {logFields} from '../src/logging.ts';
import {headers} from '../src/middleware.ts';
import {response} from '../src/response.ts';
import {work} from '../src/worker.ts';

test('end-to-end traceId propagation across pipeline stages', () => {
  const traceId = 'trace-root-123';
  const userId = 'user-abc-456';
  const job = {requestId: 'job-id-789', name: 'compute-statistics'};

  const result = handle(traceId, userId, job);

  // RequestContext must have traceId and no requestId
  assert.equal(result.context.traceId, traceId);
  assert.equal(result.context.userId, userId);
  assert.equal('requestId' in result.context, false);
  assert.equal(result.context.requestId, undefined);

  // Wire headers map traceId to 'x-request-id'
  assert.equal(result.headers['x-request-id'], traceId);

  // Log fields maintain existing wire key 'requestId' populated with traceId
  assert.equal(result.logs.requestId, traceId);
  assert.equal(result.logs.userId, userId);

  // Response wire key 'requestId' receives traceId
  assert.equal(result.body.requestId, traceId);

  // Worker stage propagated the forked trace identifier with suffix
  assert.equal(result.body.payload.trace, `${traceId}/worker`);

  // Original context non-mutation preserved
  assert.equal(result.context.traceId, traceId);
});

test('unrelated Job.requestId and audit requestId remain unchanged and distinct from traceId', () => {
  const traceId = 'trace-unique-uuid';
  const jobRequestId = 'job-unique-identifier';
  const jobName = 'index-worker';
  const job = {requestId: jobRequestId, name: jobName};

  const context = createContext(traceId, 'user-operator');

  // Verify describeJob preserves job.requestId, auditLabel(job.requestId), and context.traceId
  const description = describeJob(job, context);
  assert.equal(description.requestId, jobRequestId);
  assert.equal(description.trace, traceId);
  assert.equal(description.audit, `job:${jobRequestId}`);
  assert.equal(description.name, jobName);

  // Verify auditLabel directly
  assert.equal(auditLabel(jobRequestId), `job:${jobRequestId}`);

  // Verify end-to-end handle preserves distinct Job.requestId and traceId
  const result = handle(traceId, 'user-operator', job);
  assert.equal(result.body.requestId, traceId);
  assert.equal(result.body.payload.requestId, jobRequestId);
  assert.notEqual(result.body.payload.requestId, result.body.requestId);
  assert.equal(result.body.payload.audit, `job:${jobRequestId}`);
  assert.equal(result.body.payload.trace, `${traceId}/worker`);
});

test('context creation and forkContext non-mutation and suffix behavior', () => {
  const root = createContext('base-trace', 'usr');
  assert.equal(root.traceId, 'base-trace');
  assert.equal(root.userId, 'usr');
  assert.equal('requestId' in root, false);

  const child = forkContext(root, 'stage-1');
  assert.equal(child.traceId, 'base-trace/stage-1');
  assert.equal(child.userId, 'usr');
  assert.equal('requestId' in child, false);

  // Non-mutation of original context
  assert.equal(root.traceId, 'base-trace');

  // Chained forks
  const grandchild = forkContext(child, 'sub-stage');
  assert.equal(grandchild.traceId, 'base-trace/stage-1/sub-stage');
  assert.equal(child.traceId, 'base-trace/stage-1');
  assert.equal(root.traceId, 'base-trace');
});

test('individual consumers handle traceId correctly', () => {
  const ctx = createContext('trace-consumer-test', 'u-consumer');

  // Middleware headers
  assert.deepEqual(headers(ctx), {'x-request-id': 'trace-consumer-test'});

  // Logging output keys and values
  assert.deepEqual(logFields(ctx), {requestId: 'trace-consumer-test', userId: 'u-consumer'});

  // Response output keys and values
  const resp = response(ctx, {done: true});
  assert.deepEqual(resp, {requestId: 'trace-consumer-test', payload: {done: true}});

  // Worker integration
  const job = {requestId: 'job-consumer', name: 'task'};
  const workResult = work(ctx, job);
  assert.deepEqual(workResult, {
    requestId: 'job-consumer',
    trace: 'trace-consumer-test/worker',
    audit: 'job:job-consumer',
    name: 'task'
  });
});
