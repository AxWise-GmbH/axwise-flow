import assert from 'node:assert/strict';
import {test, describe} from 'node:test';
import {makeRouter} from '../src/app.ts';
import {unrelatedHelper} from '../src/routes/accounts.ts';
import {auditCallback} from '../src/routes/orders.ts';

describe('Regression tests for route registration and error forwarding', () => {
  const router = makeRouter();

  test('router registers routes in exact expected order', () => {
    assert.equal(router.routes.length, 5);
    assert.deepEqual(
      router.routes.map(r => ({ method: r.method, path: r.path })),
      [
        { method: 'GET', path: '/accounts/:id' },
        { method: 'POST', path: '/accounts' },
        { method: 'GET', path: '/health' },
        { method: 'GET', path: '/orders/:id' },
        { method: 'DELETE', path: '/orders/:id' },
      ]
    );
  });

  test('GET /accounts/:id handles success', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/accounts/:id');
    assert.ok(route);
    const req = { id: 'acc-123' };
    const res = { send: (val) => `sent:${val}` };
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const result = await route.handler(req, res, next);
    assert.equal(result, 'sent:account:acc-123');
    assert.equal(nextCalled, false);
  });

  test('GET /accounts/:id forwards failure to next', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/accounts/:id');
    assert.ok(route);
    const req = { id: 'acc-123', fail: true };
    const res = { send: (val) => `sent:${val}` };
    let capturedError = null;
    const next = (err) => { capturedError = err; };
    await route.handler(req, res, next);
    assert.ok(capturedError instanceof Error);
    assert.equal(capturedError.message, 'account read');
  });

  test('POST /accounts handles success', async () => {
    const route = router.routes.find(r => r.method === 'POST' && r.path === '/accounts');
    assert.ok(route);
    const req = { id: 'acc-456' };
    const res = { send: (val) => `sent:${val}` };
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const result = await route.handler(req, res, next);
    assert.equal(result, 'sent:created:acc-456');
    assert.equal(nextCalled, false);
  });

  test('POST /accounts forwards failure to next (named async function)', async () => {
    const route = router.routes.find(r => r.method === 'POST' && r.path === '/accounts');
    assert.ok(route);
    const req = { id: 'acc-456', fail: true };
    const res = { send: (val) => `sent:${val}` };
    let capturedError = null;
    const next = (err) => { capturedError = err; };
    await route.handler(req, res, next);
    assert.ok(capturedError instanceof Error);
    assert.equal(capturedError.message, 'account create');
  });

  test('GET /health synchronous route operates normally without error forwarding adapter', () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/health');
    assert.ok(route);
    const req = { id: 'health' };
    const res = { send: (val) => `sent:${val}` };
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const result = route.handler(req, res, next);
    assert.equal(result, 'sent:ok');
    assert.equal(nextCalled, false);
  });

  test('GET /orders/:id handles success', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/orders/:id');
    assert.ok(route);
    const req = { id: 'ord-789' };
    const res = { send: (val) => `sent:${val}` };
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const result = await route.handler(req, res, next);
    assert.equal(result, 'sent:ORD-789');
    assert.equal(nextCalled, false);
  });

  test('GET /orders/:id forwards failure to next', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/orders/:id');
    assert.ok(route);
    const req = { id: 'ord-789', fail: true };
    const res = { send: (val) => `sent:${val}` };
    let capturedError = null;
    const next = (err) => { capturedError = err; };
    await route.handler(req, res, next);
    assert.ok(capturedError instanceof Error);
    assert.equal(capturedError.message, 'order read');
  });

  test('DELETE /orders/:id handles success', async () => {
    const route = router.routes.find(r => r.method === 'DELETE' && r.path === '/orders/:id');
    assert.ok(route);
    const req = { id: 'ord-999' };
    const res = { send: (val) => `sent:${val}` };
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const result = await route.handler(req, res, next);
    assert.equal(result, 'sent:deleted:ord-999');
    assert.equal(nextCalled, false);
  });

  test('DELETE /orders/:id forwards failure to next', async () => {
    const route = router.routes.find(r => r.method === 'DELETE' && r.path === '/orders/:id');
    assert.ok(route);
    const req = { id: 'ord-999', fail: true };
    const res = { send: (val) => `sent:${val}` };
    let capturedError = null;
    const next = (err) => { capturedError = err; };
    await route.handler(req, res, next);
    assert.ok(capturedError instanceof Error);
    assert.equal(capturedError.message, 'order delete');
  });

  test('unrelated helper functions and callbacks remain unwrapped', async () => {
    await assert.rejects(async () => {
      await unrelatedHelper();
    }, { message: 'helper' });

    await assert.rejects(async () => {
      await auditCallback();
    }, { message: 'audit' });
  });
});
