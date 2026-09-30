import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {describeJob} from '../src/jobs.ts';
import {logFields} from '../src/logging.ts';
import {headers} from '../src/middleware.ts';
import {response} from '../src/response.ts';

describe('RequestContext traceId migration and propagation', () => {
  test('end-to-end propagation reaches every stage with traceId', () => {
    const trace = 'trace-alpha-123';
    const user = 'user-test-456';
    const job = {requestId: 'job-xyz-789', name: 'data-sync'};

    const out = handle(trace, user, job);

    // Context field rename and lack of requestId compatibility property
    assert.equal(out.context.traceId, trace);
    assert.equal(out.context.userId, user);
    assert.equal('requestId' in out.context, false);
    assert.equal(out.context.requestId, undefined);

    // Headers wire output preserves key but maps to traceId
    assert.deepEqual(out.headers, {'x-request-id': trace});

    // Logging destructured alias preserves output key
    assert.deepEqual(out.logs, {requestId: trace, userId: user});

    // Body response wire key is preserved
    assert.equal(out.body.requestId, trace);

    // Propagated context in worker reached describeJob with forkContext suffix
    assert.equal(out.body.payload.trace, `${trace}/worker`);

    // Non-mutation of original context
    assert.equal(out.context.traceId, trace);
  });

  test('unrelated Job identifier and audit label remain unchanged', () => {
    const trace = 'trace-id-abc';
    const user = 'user-1';
    const job = {requestId: 'job-identifier-001', name: 'indexer'};

    const out = handle(trace, user, job);

    // Job.requestId is distinct from the traceId wire response
    assert.equal(out.body.requestId, trace);
    assert.equal(out.body.payload.requestId, job.requestId);
    assert.notEqual(out.body.payload.requestId, out.body.requestId);

    // Audit label uses the unrelated Job.requestId
    assert.equal(out.body.payload.audit, 'job:job-identifier-001');
    assert.equal(out.body.payload.name, 'indexer');

    // Direct describeJob invocation
    const ctx = createContext(trace, user);
    const jobDescription = describeJob(job, ctx);
    assert.equal(jobDescription.requestId, job.requestId);
    assert.equal(jobDescription.trace, trace);
    assert.equal(jobDescription.audit, 'job:job-identifier-001');
    assert.equal(jobDescription.name, 'indexer');
  });

  test('context factory and non-mutation with forkContext suffixes', () => {
    const initial = createContext('root-trace', 'user-admin');
    assert.equal(initial.traceId, 'root-trace');
    assert.equal(initial.userId, 'user-admin');
    assert.equal('requestId' in initial, false);

    const child = forkContext(initial, 'stage-1');
    assert.equal(child.traceId, 'root-trace/stage-1');
    assert.equal(child.userId, 'user-admin');

    // Original context is not mutated
    assert.equal(initial.traceId, 'root-trace');

    const grandchild = forkContext(child, 'stage-2');
    assert.equal(grandchild.traceId, 'root-trace/stage-1/stage-2');
    assert.equal(child.traceId, 'root-trace/stage-1');
    assert.equal(initial.traceId, 'root-trace');
  });

  test('isolated middleware, logging, and response consumers', () => {
    const ctx = createContext('trace-sample', 'user-sample');

    assert.deepEqual(headers(ctx), {'x-request-id': 'trace-sample'});
    assert.deepEqual(logFields(ctx), {requestId: 'trace-sample', userId: 'user-sample'});
    assert.deepEqual(response(ctx, {done: true}), {requestId: 'trace-sample', payload: {done: true}});
  });
});
