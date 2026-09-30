import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {headers} from '../src/middleware.ts';
import {logFields} from '../src/logging.ts';
import {response} from '../src/response.ts';
import {work} from '../src/worker.ts';
import {describeJob} from '../src/jobs.ts';
import {auditLabel} from '../src/job-types.ts';
import {traceSummary} from '../src/plugins/index.ts';
import {record0, audit0} from '../src/catalog/record0.ts';

describe('Regression tests: traceId rename and propagation', () => {
  it('RequestContext construction and no compatibility requestId member', () => {
    const ctx = createContext('trace-root-123', 'user-abc');
    assert.equal(ctx.traceId, 'trace-root-123');
    assert.equal(ctx.userId, 'user-abc');
    assert.equal('requestId' in ctx, false);
    assert.equal(ctx.requestId, undefined);
  });

  it('forkContext non-mutation and suffix behavior', () => {
    const parent = createContext('trace-parent', 'user-1');
    const child = forkContext(parent, 'child-suffix');
    assert.equal(parent.traceId, 'trace-parent');
    assert.equal(child.traceId, 'trace-parent/child-suffix');
    assert.equal(child.userId, 'user-1');
    assert.equal('requestId' in child, false);
    assert.equal(child.requestId, undefined);
    assert.notEqual(parent, child);
  });

  it('headers, logs, and response wire/output shapes', () => {
    const ctx = createContext('trace-stage-1', 'user-2');
    const h = headers(ctx);
    assert.deepEqual(h, {'x-request-id': 'trace-stage-1'});

    const l = logFields(ctx);
    assert.deepEqual(l, {requestId: 'trace-stage-1', userId: 'user-2'});

    const r = response(ctx, {status: 'ok'});
    assert.deepEqual(r, {requestId: 'trace-stage-1', payload: {status: 'ok'}});
  });

  it('plugins traceSummary propagation', () => {
    const ctx = createContext('trace-plugin-456', 'user-3');
    const summary = traceSummary(ctx);
    assert.equal(summary.length, 8);
    for (let i = 0; i < 8; i++) {
      assert.deepEqual(summary[i], {
        requestId: 'trace-plugin-456',
        tag: `plugin${i}`,
        user: 'user-3',
      });
    }
  });

  it('unrelated Job identifier and auditLabel', () => {
    const job = {requestId: 'job-req-789', name: 'sync-cache'};
    const ctx = createContext('trace-job-stage', 'user-worker');

    assert.equal(auditLabel(job.requestId), 'job:job-req-789');

    const desc = describeJob(job, ctx);
    assert.deepEqual(desc, {
      requestId: 'job-req-789',
      trace: 'trace-job-stage',
      audit: 'job:job-req-789',
      name: 'sync-cache',
    });

    const workResult = work(ctx, job);
    assert.deepEqual(workResult, {
      requestId: 'job-req-789',
      trace: 'trace-job-stage/worker',
      audit: 'job:job-req-789',
      name: 'sync-cache',
    });
    // Context was not mutated by work
    assert.equal(ctx.traceId, 'trace-job-stage');
  });

  it('end-to-end propagation via app handle', () => {
    const job = {requestId: 'job-e2e-42', name: 'batch-export'};
    const result = handle('trace-e2e-100', 'user-e2e', job);

    // Context field rename and propagation
    assert.equal(result.context.traceId, 'trace-e2e-100');
    assert.equal(result.context.userId, 'user-e2e');
    assert.equal('requestId' in result.context, false);
    assert.equal(result.context.requestId, undefined);

    // Headers stage
    assert.deepEqual(result.headers, {'x-request-id': 'trace-e2e-100'});

    // Logging stage
    assert.deepEqual(result.logs, {
      requestId: 'trace-e2e-100',
      userId: 'user-e2e',
    });

    // Body response stage
    assert.equal(result.body.requestId, 'trace-e2e-100');

    // Worker stage payload with suffixed trace and unrelated job identifier
    assert.deepEqual(result.body.payload, {
      requestId: 'job-e2e-42',
      trace: 'trace-e2e-100/worker',
      audit: 'job:job-e2e-42',
      name: 'batch-export',
    });
  });

  it('catalog RequestContext types and requestId fields remain unchanged', () => {
    const catalogCtx = {requestId: 'cat-123', category: 'books'};
    const catRecord = record0(catalogCtx);
    assert.deepEqual(catRecord, {
      requestId: 'cat-123',
      category: 'books',
      label: 'record0:cat-123',
    });
    assert.equal(audit0('cat-audit-99'), 'audit0:cat-audit-99');
  });
});
