import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {describeJob} from '../src/jobs.ts';
import {traceSummary} from '../src/plugins/index.ts';
import {record0, audit0} from '../src/catalog/record0.ts';

describe('RequestContext traceId migration regression tests', () => {
  test('end-to-end propagation across all stages', () => {
    const trace = 'trace-alpha-123';
    const user = 'user-alice';
    const job = {requestId: 'job-987', name: 'process-orders'};

    const res = handle(trace, user, job);

    // RequestContext field is traceId, not requestId
    assert.equal(res.context.traceId, trace);
    assert.equal(Object.prototype.hasOwnProperty.call(res.context, 'requestId'), false);
    assert.equal(res.context.userId, user);

    // Wire and log outputs keep existing keys
    assert.equal(res.headers['x-request-id'], trace);
    assert.equal(res.logs.requestId, trace);
    assert.equal(res.logs.userId, user);
    assert.equal(res.body.requestId, trace);

    // Forked context suffix reaches worker and job description
    assert.equal(res.body.payload.trace, `${trace}/worker`);

    // Non-mutation behavior of context
    assert.equal(res.context.traceId, trace);
  });

  test('unrelated Job identifier and audit variables are preserved', () => {
    const trace = 'trace-beta-456';
    const user = 'user-bob';
    const job = {requestId: 'job-distinct-id', name: 'index-records'};

    const res = handle(trace, user, job);

    // Job.requestId should not be overwritten by traceId
    assert.equal(res.body.payload.requestId, 'job-distinct-id');
    assert.notEqual(res.body.payload.requestId, trace);
    assert.equal(res.body.payload.audit, 'job:job-distinct-id');
    assert.equal(res.body.payload.name, 'index-records');

    // Direct unit test of describeJob
    const ctx = createContext('trace-custom', 'user-carol');
    const jobDesc = describeJob({requestId: 'job-unit-1', name: 'unit-test'}, ctx);
    assert.deepEqual(jobDesc, {
      requestId: 'job-unit-1',
      trace: 'trace-custom',
      audit: 'job:job-unit-1',
      name: 'unit-test',
    });
  });

  test('context construction and forking with suffixes', () => {
    const ctx = createContext('root-trace', 'user-dave');
    assert.equal(ctx.traceId, 'root-trace');
    assert.equal(ctx.userId, 'user-dave');
    assert.equal(Object.prototype.hasOwnProperty.call(ctx, 'requestId'), false);

    const forked1 = forkContext(ctx, 'step1');
    assert.equal(forked1.traceId, 'root-trace/step1');
    assert.equal(forked1.userId, 'user-dave');
    // Ensure non-mutation
    assert.equal(ctx.traceId, 'root-trace');

    const forked2 = forkContext(forked1, 'step2');
    assert.equal(forked2.traceId, 'root-trace/step1/step2');
    assert.equal(forked1.traceId, 'root-trace/step1');
  });

  test('traceSummary in src/plugins/index.ts and all plugins preserve output', () => {
    const ctx = createContext('plugin-trace', 'user-eve');
    const summary = traceSummary(ctx);

    assert.equal(Array.isArray(summary), true);
    assert.equal(summary.length, 8);
    for (let i = 0; i < 8; i++) {
      assert.deepEqual(summary[i], {
        requestId: 'plugin-trace',
        tag: `plugin${i}`,
        user: 'user-eve',
      });
    }
  });

  test('catalog modules RequestContext and requestId remain independent and functional', () => {
    const catCtx = {requestId: 'cat-req-001', category: 'books'};
    const rec = record0(catCtx);
    assert.deepEqual(rec, {
      requestId: 'cat-req-001',
      category: 'books',
      label: 'record0:cat-req-001',
    });
    assert.equal(audit0('cat-audit-99'), 'audit0:cat-audit-99');
  });
});
