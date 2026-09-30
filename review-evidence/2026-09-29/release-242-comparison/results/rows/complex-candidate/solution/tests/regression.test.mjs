import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {headers} from '../src/middleware.ts';
import {logFields} from '../src/logging.ts';
import {response} from '../src/response.ts';
import {describeJob} from '../src/jobs.ts';
import {work} from '../src/worker.ts';

describe('RequestContext rename and traceId propagation', () => {
  it('creates context with traceId and without requestId', () => {
    const ctx = createContext('trace-abc', 'user-1');
    assert.equal(ctx.traceId, 'trace-abc');
    assert.equal(ctx.userId, 'user-1');
    assert.equal('requestId' in ctx, false);
    assert.equal(ctx.requestId, undefined);
  });

  it('forkContext preserves non-mutation and appends suffix to traceId', () => {
    const original = createContext('trace-abc', 'user-1');
    const child = forkContext(original, 'worker');
    assert.equal(child.traceId, 'trace-abc/worker');
    assert.equal(child.userId, 'user-1');
    assert.equal('requestId' in child, false);
    // Non-mutation check
    assert.equal(original.traceId, 'trace-abc');
    assert.notEqual(original, child);
  });

  it('headers uses context.traceId for wire key x-request-id', () => {
    const ctx = createContext('trace-wire', 'user-2');
    const res = headers(ctx);
    assert.deepEqual(res, {'x-request-id': 'trace-wire'});
  });

  it('logFields destructures traceId to requestId output field', () => {
    const ctx = createContext('trace-log', 'user-3');
    const res = logFields(ctx);
    assert.deepEqual(res, {requestId: 'trace-log', userId: 'user-3'});
  });

  it('response uses context.traceId for wire key requestId', () => {
    const ctx = createContext('trace-resp', 'user-4');
    const res = response(ctx, {data: 123});
    assert.deepEqual(res, {requestId: 'trace-resp', payload: {data: 123}});
  });

  it('describeJob keeps unrelated Job.requestId intact while using context.traceId for trace', () => {
    const ctx = createContext('trace-job-ctx', 'user-5');
    const job = {requestId: 'job-999', name: 'sync-cache'};
    const res = describeJob(job, ctx);
    assert.equal(res.requestId, 'job-999');
    assert.equal(res.trace, 'trace-job-ctx');
    assert.equal(res.audit, 'job:job-999');
    assert.equal(res.name, 'sync-cache');
  });

  it('work forks context and describes job with child traceId', () => {
    const ctx = createContext('trace-root', 'user-6');
    const job = {requestId: 'job-888', name: 'async-task'};
    const res = work(ctx, job);
    assert.equal(res.requestId, 'job-888');
    assert.equal(res.trace, 'trace-root/worker');
    assert.equal(res.audit, 'job:job-888');
    assert.equal(res.name, 'async-task');
  });

  it('end-to-end propagation through handle', () => {
    const traceId = 'trace-e2e-root';
    const userId = 'user-admin';
    const job = {requestId: 'job-777', name: 'e2e-job'};

    const out = handle(traceId, userId, job);

    // Context verification
    assert.equal(out.context.traceId, 'trace-e2e-root');
    assert.equal(out.context.userId, 'user-admin');
    assert.equal('requestId' in out.context, false);
    assert.equal(out.context.requestId, undefined);

    // Headers verification
    assert.deepEqual(out.headers, {'x-request-id': 'trace-e2e-root'});

    // Logs verification
    assert.deepEqual(out.logs, {requestId: 'trace-e2e-root', userId: 'user-admin'});

    // Body and payload verification
    assert.equal(out.body.requestId, 'trace-e2e-root');
    assert.deepEqual(out.body.payload, {
      requestId: 'job-777',
      trace: 'trace-e2e-root/worker',
      audit: 'job:job-777',
      name: 'e2e-job',
    });
  });
});
