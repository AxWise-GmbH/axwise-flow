import assert from 'node:assert/strict';
import {test, describe} from 'node:test';
import {makeRouter} from '../src/app.ts';
import {documentation, unrelatedHelper} from '../src/routes/accounts.ts';
import {auditCallback} from '../src/routes/orders.ts';

describe('Router registration order and routes', () => {
  test('registers all routes in correct order', () => {
    const router = makeRouter();
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

  test('synchronous route /health is preserved and not wrapped', () => {
    const router = makeRouter();
    const route = router.routes.find(r => r.path === '/health');
    assert.ok(route);
    assert.equal(route.method, 'GET');

    const res = { sent: null, send(v) { this.sent = v; return v; } };
    let nextCalled = false;
    const result = route.handler({ id: '1' }, res, () => { nextCalled = true; });

    assert.equal(result, 'ok');
    assert.equal(res.sent, 'ok');
    assert.equal(nextCalled, false);
    // Ensure it is synchronous (not returning a promise)
    assert.notEqual(typeof result?.then, 'function');
  });
});

describe('Async route successful handling', () => {
  const router = makeRouter();

  test('GET /accounts/:id succeeds and returns response value', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/accounts/:id');
    const res = { sent: null, send(v) { this.sent = v; return v; } };
    let nextError = null;

    const result = await route.handler({ id: 'acc123' }, res, (err) => { nextError = err; });

    assert.equal(result, 'account:acc123');
    assert.equal(res.sent, 'account:acc123');
    assert.equal(nextError, null);
  });

  test('POST /accounts succeeds and returns response value', async () => {
    const route = router.routes.find(r => r.method === 'POST' && r.path === '/accounts');
    const res = { sent: null, send(v) { this.sent = v; return v; } };
    let nextError = null;

    const result = await route.handler({ id: 'newAcc' }, res, (err) => { nextError = err; });

    assert.equal(result, 'created:newAcc');
    assert.equal(res.sent, 'created:newAcc');
    assert.equal(nextError, null);
  });

  test('GET /orders/:id succeeds and returns response value', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/orders/:id');
    const res = { sent: null, send(v) { this.sent = v; return v; } };
    let nextError = null;

    const result = await route.handler({ id: 'ord456' }, res, (err) => { nextError = err; });

    assert.equal(result, 'ORD456');
    assert.equal(res.sent, 'ORD456');
    assert.equal(nextError, null);
  });

  test('DELETE /orders/:id succeeds and returns response value', async () => {
    const route = router.routes.find(r => r.method === 'DELETE' && r.path === '/orders/:id');
    const res = { sent: null, send(v) { this.sent = v; return v; } };
    let nextError = null;

    const result = await route.handler({ id: 'ord789' }, res, (err) => { nextError = err; });

    assert.equal(result, 'deleted:ord789');
    assert.equal(res.sent, 'deleted:ord789');
    assert.equal(nextError, null);
  });
});

describe('Async route error forwarding via withErrors', () => {
  const router = makeRouter();

  test('GET /accounts/:id forwards error to next on rejection', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/accounts/:id');
    const res = { sent: null, send(v) { this.sent = v; return v; } };
    let forwardedError = null;

    await route.handler({ fail: true, id: 'acc123' }, res, (err) => { forwardedError = err; });

    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'account read');
    assert.equal(res.sent, null);
  });

  test('POST /accounts (named function createAccount) forwards error to next on rejection', async () => {
    const route = router.routes.find(r => r.method === 'POST' && r.path === '/accounts');
    const res = { sent: null, send(v) { this.sent = v; return v; } };
    let forwardedError = null;

    await route.handler({ fail: true, id: 'newAcc' }, res, (err) => { forwardedError = err; });

    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'account create');
    assert.equal(res.sent, null);
  });

  test('GET /orders/:id forwards error to next on rejection', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/orders/:id');
    const res = { sent: null, send(v) { this.sent = v; return v; } };
    let forwardedError = null;

    await route.handler({ fail: true, id: 'ord456' }, res, (err) => { forwardedError = err; });

    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'order read');
    assert.equal(res.sent, null);
  });

  test('DELETE /orders/:id forwards error to next on rejection', async () => {
    const route = router.routes.find(r => r.method === 'DELETE' && r.path === '/orders/:id');
    const res = { sent: null, send(v) { this.sent = v; return v; } };
    let forwardedError = null;

    await route.handler({ fail: true, id: 'ord789' }, res, (err) => { forwardedError = err; });

    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'order delete');
    assert.equal(res.sent, null);
  });
});

describe('Unrelated helpers, callbacks, and constants are preserved', () => {
  test('documentation string constant is preserved', () => {
    assert.equal(documentation, "router.get('/fake', async handler)");
  });

  test('unrelatedHelper rejects directly without being wrapped in withErrors', async () => {
    await assert.rejects(
      async () => await unrelatedHelper(),
      { message: 'helper' }
    );
  });

  test('auditCallback rejects directly without being wrapped in withErrors', async () => {
    await assert.rejects(
      async () => await auditCallback(),
      { message: 'audit' }
    );
  });
});
