import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {describeJob} from '../src/jobs.ts';
import {logFields} from '../src/logging.ts';
import {headers} from '../src/middleware.ts';
import {response} from '../src/response.ts';
import {work} from '../src/worker.ts';

describe('RequestContext traceId migration and propagation', () => {
  test('end-to-end pipeline propagates traceId to every stage and keeps wire/output keys', () => {
    const trace = 'trace-alpha-123';
    const user = 'user-alice';
    const job = {requestId: 'job-task-999', name: 'data-processing'};

    const result = handle(trace, user, job);

    // RequestContext field is traceId and does not have a requestId compatibility member
    assert.equal(result.context.traceId, trace);
    assert.equal(result.context.userId, user);
    assert.equal('requestId' in result.context, false);
    assert.equal(result.context.requestId, undefined);

    // Middleware headers wire key
    assert.deepEqual(result.headers, {'x-request-id': trace});

    // Logging fields preserve output key requestId with trace value
    assert.deepEqual(result.logs, {requestId: trace, userId: user});

    // Response wire/output key requestId matches traceId, payload has suffixed trace and Job.requestId
    assert.equal(result.body.requestId, trace);
    assert.deepEqual(result.body.payload, {
      requestId: 'job-task-999',
      trace: 'trace-alpha-123/worker',
      audit: 'job:job-task-999',
      name: 'data-processing',
    });
  });

  test('unrelated Job.requestId and audit requestId remain separate and intact', () => {
    const context = createContext('ctx-trace-001', 'user-bob');
    const job = {requestId: 'job-req-555', name: 'image-render'};

    // Context has traceId, no requestId
    assert.equal(context.traceId, 'ctx-trace-001');
    assert.equal('requestId' in context, false);

    // describeJob correctly distinguishes Job.requestId from context.traceId
    const described = describeJob(job, context);
    assert.equal(described.requestId, 'job-req-555');
    assert.equal(described.trace, 'ctx-trace-001');
    assert.equal(described.audit, 'job:job-req-555');
    assert.equal(described.name, 'image-render');

    // work forks context and leaves Job.requestId untouched
    const workerResult = work(context, job);
    assert.equal(workerResult.requestId, 'job-req-555');
    assert.equal(workerResult.trace, 'ctx-trace-001/worker');
    assert.equal(workerResult.audit, 'job:job-req-555');
  });

  test('forkContext non-mutation and suffix behavior', () => {
    const rootContext = createContext('trace-root', 'user-charlie');
    const childContext = forkContext(rootContext, 'stage-1');
    const grandchildContext = forkContext(childContext, 'stage-2');

    // Root context is unchanged (immutability)
    assert.equal(rootContext.traceId, 'trace-root');
    assert.equal(rootContext.userId, 'user-charlie');
    assert.equal('requestId' in rootContext, false);

    // Child contexts contain appended suffixes
    assert.equal(childContext.traceId, 'trace-root/stage-1');
    assert.equal(childContext.userId, 'user-charlie');
    assert.equal('requestId' in childContext, false);

    assert.equal(grandchildContext.traceId, 'trace-root/stage-1/stage-2');
    assert.equal(grandchildContext.userId, 'user-charlie');
    assert.equal('requestId' in grandchildContext, false);
  });

  test('individual stage consumers operate with traceId', () => {
    const context = createContext('unit-trace-42', 'user-dana');

    assert.deepEqual(headers(context), {'x-request-id': 'unit-trace-42'});
    assert.deepEqual(logFields(context), {requestId: 'unit-trace-42', userId: 'user-dana'});
    assert.deepEqual(response(context, {ok: true}), {requestId: 'unit-trace-42', payload: {ok: true}});
  });
});
