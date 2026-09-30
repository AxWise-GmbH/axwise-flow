import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {headers} from '../src/middleware.ts';
import {logFields} from '../src/logging.ts';
import {response} from '../src/response.ts';
import {describeJob} from '../src/jobs.ts';
import {auditLabel} from '../src/job-types.ts';
import {work} from '../src/worker.ts';

describe('Regression: RequestContext traceId rename & end-to-end propagation', () => {
  it('propagates traceId through handle pipeline to all stages', () => {
    const trace = 'trace-alpha-001';
    const user = 'user-alice';
    const job = {requestId: 'job-777', name: 'process-data'};

    const result = handle(trace, user, job);

    // Context check: traceId present, no requestId member
    assert.equal(result.context.traceId, trace);
    assert.equal(result.context.userId, user);
    assert.equal('requestId' in result.context, false);
    assert.equal(result.context.requestId, undefined);

    // Headers check: wire header receives trace
    assert.deepEqual(result.headers, {'x-request-id': trace});

    // Logs check: wire/output key requestId receives traceId value
    assert.deepEqual(result.logs, {requestId: trace, userId: user});

    // Body check: response requestId wire key receives traceId, payload receives worker-forked trace
    assert.equal(result.body.requestId, trace);
    assert.equal(result.body.payload.trace, `${trace}/worker`);
    assert.equal(result.body.payload.requestId, 'job-777');
    assert.equal(result.body.payload.audit, 'job:job-777');
    assert.equal(result.body.payload.name, 'process-data');
  });

  it('createContext sets traceId and has no requestId property', () => {
    const ctx = createContext('trace-initial', 'user-bob');
    assert.equal(ctx.traceId, 'trace-initial');
    assert.equal(ctx.userId, 'user-bob');
    assert.equal('requestId' in ctx, false);
    assert.equal(ctx.requestId, undefined);
  });

  it('forkContext extends traceId with suffix and does not mutate parent context', () => {
    const parent = createContext('trace-base', 'user-charlie');
    const child = forkContext(parent, 'child');
    const grandchild = forkContext(child, 'grandchild');

    assert.equal(parent.traceId, 'trace-base');
    assert.equal(child.traceId, 'trace-base/child');
    assert.equal(child.userId, 'user-charlie');
    assert.equal(grandchild.traceId, 'trace-base/child/grandchild');
    assert.equal(grandchild.userId, 'user-charlie');

    assert.equal('requestId' in child, false);
    assert.equal('requestId' in grandchild, false);
  });

  it('middleware headers maps context traceId to x-request-id', () => {
    const ctx = createContext('trace-hdr-test', 'user-hdr');
    assert.deepEqual(headers(ctx), {'x-request-id': 'trace-hdr-test'});
  });

  it('logging logFields maps context traceId to output requestId key', () => {
    const ctx = createContext('trace-log-test', 'user-log');
    assert.deepEqual(logFields(ctx), {requestId: 'trace-log-test', userId: 'user-log'});
  });

  it('response preserves requestId wire key holding context traceId', () => {
    const ctx = createContext('trace-resp-test', 'user-resp');
    const res = response(ctx, {status: 'ok'});
    assert.deepEqual(res, {requestId: 'trace-resp-test', payload: {status: 'ok'}});
  });

  it('worker forks context with worker suffix and processes job without mutating parent', () => {
    const ctx = createContext('trace-work-test', 'user-work');
    const job = {requestId: 'job-wrk-1', name: 'work-task'};
    const jobResult = work(ctx, job);

    assert.equal(ctx.traceId, 'trace-work-test');
    assert.equal(jobResult.trace, 'trace-work-test/worker');
    assert.equal(jobResult.requestId, 'job-wrk-1');
    assert.equal(jobResult.audit, 'job:job-wrk-1');
    assert.equal(jobResult.name, 'work-task');
  });
});

describe('Regression: Unrelated Job identifier and audit preservation', () => {
  it('describeJob keeps job.requestId distinct from context traceId', () => {
    const ctx = createContext('trace-distinct', 'user-job');
    const job = {requestId: 'job-unrelated-42', name: 'distinct-job'};
    const described = describeJob(job, ctx);

    assert.equal(described.requestId, 'job-unrelated-42');
    assert.equal(described.trace, 'trace-distinct');
    assert.equal(described.audit, 'job:job-unrelated-42');
    assert.equal(described.name, 'distinct-job');
    assert.notEqual(described.requestId, described.trace);
  });

  it('auditLabel formats job requestId correctly', () => {
    assert.equal(auditLabel('job-abc-123'), 'job:job-abc-123');
    assert.equal(auditLabel('req-audit-999'), 'job:req-audit-999');
  });
});
