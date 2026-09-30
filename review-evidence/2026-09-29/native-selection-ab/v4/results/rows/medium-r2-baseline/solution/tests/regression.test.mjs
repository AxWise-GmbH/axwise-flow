import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {makeRouter} from '../src/app.ts';
import {unrelatedHelper, documentation} from '../src/routes/accounts.ts';
import {auditCallback} from '../src/routes/orders.ts';

describe('Router routes and error handling', () => {
  const router = makeRouter();

  it('preserves registration order and methods', () => {
    assert.equal(router.routes.length, 5);
    assert.deepEqual(
      router.routes.map(r => ({method: r.method, path: r.path})),
      [
        {method: 'GET', path: '/accounts/:id'},
        {method: 'POST', path: '/accounts'},
        {method: 'GET', path: '/health'},
        {method: 'GET', path: '/orders/:id'},
        {method: 'DELETE', path: '/orders/:id'}
      ]
    );
  });

  it('handles GET /accounts/:id successfully', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/accounts/:id');
    let nextCalled = false;
    const res = { send: v => v };
    const result = await route.handler({ id: 'acc-1' }, res, () => { nextCalled = true; });
    assert.equal(result, 'account:acc-1');
    assert.equal(nextCalled, false);
  });

  it('forwards GET /accounts/:id errors to next', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/accounts/:id');
    let forwardedError = null;
    const res = { send: v => v };
    await route.handler({ id: 'acc-1', fail: true }, res, err => { forwardedError = err; });
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'account read');
  });

  it('handles POST /accounts successfully', async () => {
    const route = router.routes.find(r => r.method === 'POST' && r.path === '/accounts');
    let nextCalled = false;
    const res = { send: v => v };
    const result = await route.handler({ id: 'acc-2' }, res, () => { nextCalled = true; });
    assert.equal(result, 'created:acc-2');
    assert.equal(nextCalled, false);
  });

  it('forwards POST /accounts errors to next', async () => {
    const route = router.routes.find(r => r.method === 'POST' && r.path === '/accounts');
    let forwardedError = null;
    const res = { send: v => v };
    await route.handler({ id: 'acc-2', fail: true }, res, err => { forwardedError = err; });
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'account create');
  });

  it('preserves synchronous GET /health handler without wrapping', () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/health');
    const res = { send: v => v };
    let nextCalled = false;
    const result = route.handler({ id: 'none' }, res, () => { nextCalled = true; });
    assert.equal(result, 'ok');
    assert.equal(nextCalled, false);
    // Ensure it is synchronous (not returning a promise)
    assert.equal(result instanceof Promise, false);
  });

  it('handles GET /orders/:id successfully', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/orders/:id');
    let nextCalled = false;
    const res = { send: v => v };
    const result = await route.handler({ id: 'ord-1' }, res, () => { nextCalled = true; });
    assert.equal(result, 'ORD-1');
    assert.equal(nextCalled, false);
  });

  it('forwards GET /orders/:id errors to next', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/orders/:id');
    let forwardedError = null;
    const res = { send: v => v };
    await route.handler({ id: 'ord-1', fail: true }, res, err => { forwardedError = err; });
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'order read');
  });

  it('handles DELETE /orders/:id successfully', async () => {
    const route = router.routes.find(r => r.method === 'DELETE' && r.path === '/orders/:id');
    let nextCalled = false;
    const res = { send: v => v };
    const result = await route.handler({ id: 'ord-2' }, res, () => { nextCalled = true; });
    assert.equal(result, 'deleted:ord-2');
    assert.equal(nextCalled, false);
  });

  it('forwards DELETE /orders/:id errors to next', async () => {
    const route = router.routes.find(r => r.method === 'DELETE' && r.path === '/orders/:id');
    let forwardedError = null;
    const res = { send: v => v };
    await route.handler({ id: 'ord-2', fail: true }, res, err => { forwardedError = err; });
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'order delete');
  });

  it('preserves unrelated audit and helper exports unwrapped', async () => {
    assert.equal(documentation, "router.get('/fake', async handler)");
    await assert.rejects(async () => await auditCallback(), { message: 'audit' });
    await assert.rejects(async () => await unrelatedHelper(), { message: 'helper' });
  });
});
