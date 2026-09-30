import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {describeJob} from '../src/jobs.ts';
import {auditLabel} from '../src/job-types.ts';
import {traceSummary} from '../src/plugins/index.ts';
import {plugin0} from '../src/plugins/plugin0.ts';
import {plugin7} from '../src/plugins/plugin7.ts';
import {record0, audit0} from '../src/catalog/record0.ts';

describe('end-to-end traceId propagation', () => {
  test('handle propagates traceId to context, headers, logs, and response body', () => {
    const job = {requestId: 'job-alpha', name: 'process-data'};
    const result = handle('trace-001', 'user-42', job);

    // RequestContext definition rename: traceId present, no requestId field
    assert.equal(result.context.traceId, 'trace-001');
    assert.equal(result.context.userId, 'user-42');
    assert.equal('requestId' in result.context, false);
    assert.equal(result.context.requestId, undefined);

    // Middleware headers preserve wire key
    assert.equal(result.headers['x-request-id'], 'trace-001');

    // Logging output preserves wire key requestId while reading traceId
    assert.deepEqual(result.logs, {
      requestId: 'trace-001',
      userId: 'user-42',
    });

    // Response wire key requestId holds the trace identifier
    assert.equal(result.body.requestId, 'trace-001');

    // Worker creates forked context with suffix and passes to describeJob
    assert.equal(result.body.payload.trace, 'trace-001/worker');
    assert.equal(result.body.payload.name, 'process-data');

    // Unrelated Job.requestId and audit label are preserved
    assert.equal(result.body.payload.requestId, 'job-alpha');
    assert.equal(result.body.payload.audit, 'job:job-alpha');
  });

  test('forkContext suffixes correctly and preserves non-mutation behavior', () => {
    const root = createContext('trace-root', 'user-root');
    assert.equal(root.traceId, 'trace-root');
    assert.equal(root.userId, 'user-root');
    assert.equal('requestId' in root, false);

    const child = forkContext(root, 'worker');
    assert.equal(root.traceId, 'trace-root');
    assert.equal(child.traceId, 'trace-root/worker');
    assert.equal(child.userId, 'user-root');
    assert.notEqual(child, root);

    const grandchild = forkContext(child, 'step1');
    assert.equal(grandchild.traceId, 'trace-root/worker/step1');
    assert.equal(child.traceId, 'trace-root/worker');
    assert.equal(root.traceId, 'trace-root');
  });
});

describe('unrelated Job identifier', () => {
  test('Job.requestId and auditLabel remain unchanged', () => {
    const job = {requestId: 'job-xyz-789', name: 'backup-task'};
    const ctx = createContext('trace-999', 'user-admin');

    const described = describeJob(job, ctx);
    assert.equal(described.requestId, 'job-xyz-789');
    assert.equal(described.trace, 'trace-999');
    assert.equal(described.audit, 'job:job-xyz-789');
    assert.equal(described.name, 'backup-task');

    assert.equal(auditLabel('manual-job-id'), 'job:manual-job-id');
  });
});

describe('plugin traceSummary and individual plugins', () => {
  test('traceSummary and plugins consume RequestContext with traceId', () => {
    const ctx = createContext('trace-plug', 'user-plug');
    const summary = traceSummary(ctx);

    assert.equal(summary.length, 8);
    for (let i = 0; i < 8; i++) {
      assert.deepEqual(summary[i], {
        requestId: 'trace-plug',
        tag: `plugin${i}`,
        user: 'user-plug',
      });
    }

    assert.deepEqual(plugin0(ctx), {
      requestId: 'trace-plug',
      tag: 'plugin0',
      user: 'user-plug',
    });
    assert.deepEqual(plugin7(ctx), {
      requestId: 'trace-plug',
      tag: 'plugin7',
      user: 'user-plug',
    });
  });
});

describe('catalog RequestContext isolation', () => {
  test('catalog modules preserve independent RequestContext and requestId fields', () => {
    const catalogCtx = {requestId: 'cat-req-001', category: 'books'};
    const rec = record0(catalogCtx);
    assert.equal(rec.requestId, 'cat-req-001');
    assert.equal(rec.category, 'books');
    assert.equal(rec.label, 'record0:cat-req-001');
    assert.equal(audit0('cat-req-001'), 'audit0:cat-req-001');
  });
});
