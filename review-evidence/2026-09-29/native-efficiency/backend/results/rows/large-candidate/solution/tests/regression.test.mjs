import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {describeJob} from '../src/jobs.ts';
import {headers} from '../src/middleware.ts';
import {logFields} from '../src/logging.ts';
import {response} from '../src/response.ts';
import {work} from '../src/worker.ts';
import {traceSummary} from '../src/plugins/index.ts';
import {plugin0} from '../src/plugins/plugin0.ts';
import {plugin1} from '../src/plugins/plugin1.ts';
import {plugin2} from '../src/plugins/plugin2.ts';
import {plugin3} from '../src/plugins/plugin3.ts';
import {plugin4} from '../src/plugins/plugin4.ts';
import {plugin5} from '../src/plugins/plugin5.ts';
import {plugin6} from '../src/plugins/plugin6.ts';
import {plugin7} from '../src/plugins/plugin7.ts';
import {record0, audit0} from '../src/catalog/record0.ts';

describe('RequestContext rename and traceId propagation', () => {
  test('end-to-end handle propagation and unrelated Job identifier', () => {
    const job = {requestId: 'job-999', name: 'data-sync'};
    const result = handle('trace-abc', 'user-xyz', job);

    // RequestContext should have traceId and userId, but no requestId compatibility property
    assert.equal(result.context.traceId, 'trace-abc');
    assert.equal(result.context.userId, 'user-xyz');
    assert.equal('requestId' in result.context, false);
    assert.equal(result.context.requestId, undefined);

    // Headers output key and value
    assert.deepEqual(result.headers, {'x-request-id': 'trace-abc'});

    // Logging output wire keys and values
    assert.deepEqual(result.logs, {requestId: 'trace-abc', userId: 'user-xyz'});

    // Response wire key and payload
    assert.equal(result.body.requestId, 'trace-abc');
    assert.deepEqual(result.body.payload, {
      requestId: 'job-999',
      trace: 'trace-abc/worker',
      audit: 'job:job-999',
      name: 'data-sync',
    });

    // Unrelated Job identifier is preserved and distinct from traceId
    assert.equal(result.body.payload.requestId, job.requestId);
    assert.notEqual(result.body.payload.requestId, result.body.requestId);
    assert.equal(result.body.payload.audit, 'job:job-999');
  });

  test('createContext and forkContext non-mutation behavior', () => {
    const root = createContext('root-trace', 'user-1');
    assert.equal(root.traceId, 'root-trace');
    assert.equal(root.userId, 'user-1');
    assert.equal('requestId' in root, false);

    const child = forkContext(root, 'worker');
    assert.equal(child.traceId, 'root-trace/worker');
    assert.equal(child.userId, 'user-1');
    assert.equal('requestId' in child, false);

    // Non-mutation of original context
    assert.equal(root.traceId, 'root-trace');

    const grandchild = forkContext(child, 'step1');
    assert.equal(grandchild.traceId, 'root-trace/worker/step1');
    assert.equal(child.traceId, 'root-trace/worker');
    assert.equal(root.traceId, 'root-trace');
  });

  test('individual middleware, logging, and response components', () => {
    const ctx = createContext('t-42', 'u-42');

    assert.deepEqual(headers(ctx), {'x-request-id': 't-42'});
    assert.deepEqual(logFields(ctx), {requestId: 't-42', userId: 'u-42'});
    assert.deepEqual(response(ctx, {ok: true}), {requestId: 't-42', payload: {ok: true}});
  });

  test('describeJob preserves Job.requestId and audit while reading context traceId', () => {
    const ctx = createContext('trace-work', 'worker-user');
    const job = {requestId: 'job-step-1', name: 'indexer'};
    const described = describeJob(job, ctx);

    assert.deepEqual(described, {
      requestId: 'job-step-1',
      trace: 'trace-work',
      audit: 'job:job-step-1',
      name: 'indexer',
    });
  });

  test('work forks context and describes job', () => {
    const ctx = createContext('trace-root', 'worker-user');
    const job = {requestId: 'job-step-2', name: 'transformer'};
    const result = work(ctx, job);

    assert.deepEqual(result, {
      requestId: 'job-step-2',
      trace: 'trace-root/worker',
      audit: 'job:job-step-2',
      name: 'transformer',
    });
    // Original context is not mutated
    assert.equal(ctx.traceId, 'trace-root');
  });

  test('traceSummary and plugins output format', () => {
    const ctx = createContext('trace-plug', 'user-plug');
    const plugins = [plugin0, plugin1, plugin2, plugin3, plugin4, plugin5, plugin6, plugin7];

    for (let i = 0; i < plugins.length; i++) {
      const output = plugins[i](ctx);
      assert.deepEqual(output, {
        requestId: 'trace-plug',
        tag: `plugin${i}`,
        user: 'user-plug',
      });
    }

    const summary = traceSummary(ctx);
    assert.equal(summary.length, 8);
    for (let i = 0; i < summary.length; i++) {
      assert.deepEqual(summary[i], {
        requestId: 'trace-plug',
        tag: `plugin${i}`,
        user: 'user-plug',
      });
    }
  });

  test('catalog modules preserve independent RequestContext and requestId', () => {
    const catalogCtx = {requestId: 'cat-123', category: 'books'};
    const rec = record0(catalogCtx);
    assert.deepEqual(rec, {
      requestId: 'cat-123',
      category: 'books',
      label: 'record0:cat-123',
    });
    assert.equal(audit0('cat-123'), 'audit0:cat-123');
  });
});
