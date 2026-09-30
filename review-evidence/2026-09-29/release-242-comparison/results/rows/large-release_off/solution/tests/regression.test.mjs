import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {handle} from '../src/app.ts';
import {createContext, forkContext} from '../src/context-factory.ts';
import {describeJob} from '../src/jobs.ts';
import {logFields} from '../src/logging.ts';
import {headers} from '../src/middleware.ts';
import {response} from '../src/response.ts';
import {work} from '../src/worker.ts';
import {traceSummary} from '../src/plugins/index.ts';
import {record0, audit0} from '../src/catalog/record0.ts';

describe('RequestContext traceId migration and propagation', () => {
  it('constructs context with traceId and without requestId compatibility member', () => {
    const ctx = createContext('trace-root-1', 'user-42');
    assert.equal(ctx.traceId, 'trace-root-1');
    assert.equal(ctx.userId, 'user-42');
    assert.equal('requestId' in ctx, false);
    assert.equal(ctx.requestId, undefined);
  });

  it('forks context with suffix non-mutatively', () => {
    const original = createContext('trace-base', 'user-42');
    const forked = forkContext(original, 'worker');
    assert.equal(original.traceId, 'trace-base');
    assert.equal(forked.traceId, 'trace-base/worker');
    assert.equal(forked.userId, 'user-42');
    assert.equal('requestId' in forked, false);
    assert.notEqual(original, forked);
  });

  it('middleware headers output x-request-id from traceId', () => {
    const ctx = createContext('trace-mid', 'user-1');
    const h = headers(ctx);
    assert.deepEqual(h, {'x-request-id': 'trace-mid'});
  });

  it('logFields outputs requestId wire key from traceId', () => {
    const ctx = createContext('trace-log', 'user-1');
    const logs = logFields(ctx);
    assert.deepEqual(logs, {requestId: 'trace-log', userId: 'user-1'});
  });

  it('response wrapper outputs requestId wire key from traceId', () => {
    const ctx = createContext('trace-resp', 'user-1');
    const res = response(ctx, {ok: true});
    assert.deepEqual(res, {requestId: 'trace-resp', payload: {ok: true}});
  });

  it('preserves traceSummary across all plugins', () => {
    const ctx = createContext('trace-plugin', 'user-p');
    const summary = traceSummary(ctx);
    assert.equal(summary.length, 8);
    for (let i = 0; i < 8; i++) {
      assert.deepEqual(summary[i], {
        requestId: 'trace-plugin',
        tag: `plugin${i}`,
        user: 'user-p',
      });
    }
  });

  it('propagates trace identifier through end-to-end handle pipeline', () => {
    const job = {requestId: 'job-pipeline-1', name: 'process-order'};
    const result = handle('trace-pipe', 'alice', job);

    // Context inspection
    assert.equal(result.context.traceId, 'trace-pipe');
    assert.equal(result.context.userId, 'alice');
    assert.equal('requestId' in result.context, false);

    // Headers inspection
    assert.equal(result.headers['x-request-id'], 'trace-pipe');

    // Logs inspection
    assert.equal(result.logs.requestId, 'trace-pipe');
    assert.equal(result.logs.userId, 'alice');

    // Response inspection
    assert.equal(result.body.requestId, 'trace-pipe');

    // Worker payload inspection
    const payload = result.body.payload;
    assert.equal(payload.requestId, 'job-pipeline-1');
    assert.equal(payload.trace, 'trace-pipe/worker');
    assert.equal(payload.audit, 'job:job-pipeline-1');
    assert.equal(payload.name, 'process-order');
  });
});

describe('Unrelated Job and Catalog identifiers', () => {
  it('keeps Job.requestId intact and independent in describeJob and work', () => {
    const job = {requestId: 'job-unrelated-777', name: 'cleanup'};
    const ctx = createContext('trace-independent-888', 'worker-user');

    const jobDesc = describeJob(job, ctx);
    assert.equal(jobDesc.requestId, 'job-unrelated-777');
    assert.equal(jobDesc.trace, 'trace-independent-888');
    assert.equal(jobDesc.audit, 'job:job-unrelated-777');
    assert.equal(jobDesc.name, 'cleanup');

    const workerResult = work(ctx, job);
    assert.equal(workerResult.requestId, 'job-unrelated-777');
    assert.equal(workerResult.trace, 'trace-independent-888/worker');
    assert.equal(workerResult.audit, 'job:job-unrelated-777');
    assert.equal(workerResult.name, 'cleanup');
  });

  it('preserves catalog RequestContext and requestId fields', () => {
    const catCtx = {requestId: 'cat-req-001', category: 'electronics'};
    const record = record0(catCtx);
    assert.equal(record.requestId, 'cat-req-001');
    assert.equal(record.category, 'electronics');
    assert.equal(record.label, 'record0:cat-req-001');

    const audit = audit0('cat-audit-999');
    assert.equal(audit, 'audit0:cat-audit-999');
  });
});
