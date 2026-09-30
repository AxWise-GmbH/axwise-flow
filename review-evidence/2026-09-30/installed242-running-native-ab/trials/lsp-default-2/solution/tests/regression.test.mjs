import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {headers} from '../src/middleware.ts';
import {logFields} from '../src/logging.ts';
import {response} from '../src/response.ts';
import {describeJob} from '../src/jobs.ts';
import {work} from '../src/worker.ts';
import {auditLabel} from '../src/job-types.ts';
import {traceSummary} from '../src/plugins/index.ts';
import {record0, audit0} from '../src/catalog/record0.ts';

describe('RequestContext traceId rename and end-to-end propagation', () => {
  test('context construction and immutability', () => {
    const ctx = createContext('trace-001', 'user-abc');
    assert.equal(ctx.traceId, 'trace-001');
    assert.equal(ctx.userId, 'user-abc');
    assert.equal('requestId' in ctx, false);
    assert.equal(ctx.requestId, undefined);

    const child = forkContext(ctx, 'child-step');
    assert.equal(child.traceId, 'trace-001/child-step');
    assert.equal(child.userId, 'user-abc');
    assert.equal('requestId' in child, false);
    // Verify non-mutation of parent context
    assert.equal(ctx.traceId, 'trace-001');
  });

  test('propagation across headers, logging, and response', () => {
    const ctx = createContext('trace-002', 'user-def');

    const hdrs = headers(ctx);
    assert.equal(hdrs['x-request-id'], 'trace-002');

    const logs = logFields(ctx);
    assert.equal(logs.requestId, 'trace-002');
    assert.equal(logs.userId, 'user-def');

    const res = response(ctx, {status: 'ok'});
    assert.equal(res.requestId, 'trace-002');
    assert.deepEqual(res.payload, {status: 'ok'});
  });

  test('worker propagation and forkContext suffix', () => {
    const ctx = createContext('trace-003', 'user-ghi');
    const job = {requestId: 'job-alpha', name: 'indexing'};
    const jobResult = work(ctx, job);

    assert.equal(jobResult.requestId, 'job-alpha');
    assert.equal(jobResult.trace, 'trace-003/worker');
    assert.equal(jobResult.audit, 'job:job-alpha');
    assert.equal(jobResult.name, 'indexing');
  });

  test('full handle end-to-end flow', () => {
    const job = {requestId: 'job-beta', name: 'email-dispatch'};
    const result = handle('trace-root', 'user-jkl', job);

    assert.equal(result.context.traceId, 'trace-root');
    assert.equal('requestId' in result.context, false);
    assert.equal(result.context.userId, 'user-jkl');

    assert.equal(result.headers['x-request-id'], 'trace-root');
    assert.equal(result.logs.requestId, 'trace-root');
    assert.equal(result.logs.userId, 'user-jkl');

    assert.equal(result.body.requestId, 'trace-root');
    assert.deepEqual(result.body.payload, {
      requestId: 'job-beta',
      trace: 'trace-root/worker',
      audit: 'job:job-beta',
      name: 'email-dispatch',
    });
  });

  test('traceSummary and plugin consumption', () => {
    const ctx = createContext('trace-plugins', 'user-xyz');
    const summary = traceSummary(ctx);
    assert.equal(summary.length, 8);
    for (let i = 0; i < 8; i++) {
      assert.equal(summary[i].requestId, 'trace-plugins');
      assert.equal(summary[i].tag, `plugin${i}`);
      assert.equal(summary[i].user, 'user-xyz');
    }
  });
});

describe('Unrelated Job identifier and catalog isolation', () => {
  test('Job.requestId and auditLabel remain unchanged', () => {
    const job = {requestId: 'job-standalone-123', name: 'cleanup'};
    const ctx = createContext('trace-independent', 'user-1');

    assert.equal(job.requestId, 'job-standalone-123');
    assert.equal(auditLabel(job.requestId), 'job:job-standalone-123');

    const described = describeJob(job, ctx);
    assert.equal(described.requestId, 'job-standalone-123');
    assert.equal(described.trace, 'trace-independent');
    assert.equal(described.audit, 'job:job-standalone-123');
    assert.equal(described.name, 'cleanup');
  });

  test('catalog RequestContext and functions remain intact', () => {
    const catalogCtx = {requestId: 'catalog-item-1', category: 'inventory'};
    const record = record0(catalogCtx);
    assert.equal(record.requestId, 'catalog-item-1');
    assert.equal(record.category, 'inventory');
    assert.equal(record.label, 'record0:catalog-item-1');
    assert.equal(audit0('audit-item-1'), 'audit0:audit-item-1');
  });
});
