import assert from 'node:assert/strict';
import {test, describe} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {headers} from '../src/middleware.ts';
import {logFields} from '../src/logging.ts';
import {response} from '../src/response.ts';
import {describeJob} from '../src/jobs.ts';
import {work} from '../src/worker.ts';

describe('Regression tests: traceId propagation and unrelated Job identifier', () => {
  test('end-to-end propagation from app entry point handle()', () => {
    const trace = 'trace-alpha-999';
    const user = 'user-test-42';
    const job = {requestId: 'job-batch-888', name: 'image-resize'};

    const result = handle(trace, user, job);

    // RequestContext has traceId, and no requestId member
    assert.equal(result.context.traceId, trace);
    assert.equal(result.context.userId, user);
    assert.equal('requestId' in result.context, false, 'RequestContext must not have requestId property');
    assert.equal(result.context.requestId, undefined);

    // Headers propagate traceId as x-request-id
    assert.equal(result.headers['x-request-id'], trace);

    // Logs retain existing output key requestId mapped from traceId
    assert.equal(result.logs.requestId, trace);
    assert.equal(result.logs.userId, user);

    // Response body retains existing output key requestId mapped from traceId
    assert.equal(result.body.requestId, trace);

    // Worker payload receives child traceId with fork suffix and maintains non-mutation
    assert.equal(result.body.payload.trace, `${trace}/worker`);
    assert.equal(result.context.traceId, trace, 'Root context must not be mutated by worker fork');
  });

  test('unrelated Job.requestId and audit label remain unchanged', () => {
    const trace = 'trace-id-xyz';
    const user = 'user-001';
    const job = {requestId: 'job-independent-id-12345', name: 'send-email'};

    const result = handle(trace, user, job);

    // Job requestId is preserved in payload and unrelated to traceId
    assert.equal(result.body.payload.requestId, job.requestId);
    assert.notEqual(result.body.payload.requestId, trace);
    assert.equal(result.body.payload.audit, `job:${job.requestId}`);
    assert.equal(result.body.payload.name, 'send-email');
  });

  test('context-factory createContext and forkContext behavior', () => {
    const ctx = createContext('trace-root', 'user-primary');
    assert.equal(ctx.traceId, 'trace-root');
    assert.equal(ctx.userId, 'user-primary');
    assert.equal('requestId' in ctx, false);

    const forked = forkContext(ctx, 'stage-1');
    assert.equal(forked.traceId, 'trace-root/stage-1');
    assert.equal(forked.userId, 'user-primary');
    assert.equal('requestId' in forked, false);

    // Non-mutation of original context
    assert.equal(ctx.traceId, 'trace-root');

    const nestedFork = forkContext(forked, 'stage-2');
    assert.equal(nestedFork.traceId, 'trace-root/stage-1/stage-2');
    assert.equal(forked.traceId, 'trace-root/stage-1');
  });

  test('individual consumer modules propagate traceId and keep wire keys', () => {
    const ctx = createContext('trace-consumer', 'user-consumer');

    // Middleware headers
    assert.deepEqual(headers(ctx), {'x-request-id': 'trace-consumer'});

    // Logging fields
    assert.deepEqual(logFields(ctx), {requestId: 'trace-consumer', userId: 'user-consumer'});

    // Response formatting
    assert.deepEqual(response(ctx, {done: true}), {requestId: 'trace-consumer', payload: {done: true}});

    // Describe job
    const job = {requestId: 'job-unique', name: 'calc'};
    assert.deepEqual(describeJob(job, ctx), {
      requestId: 'job-unique',
      trace: 'trace-consumer',
      audit: 'job:job-unique',
      name: 'calc',
    });

    // Work creates worker child context
    assert.deepEqual(work(ctx, job), {
      requestId: 'job-unique',
      trace: 'trace-consumer/worker',
      audit: 'job:job-unique',
      name: 'calc',
    });
  });
});
