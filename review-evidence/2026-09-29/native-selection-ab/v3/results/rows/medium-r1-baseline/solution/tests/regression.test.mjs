import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {makeRouter} from '../src/app.ts';
import {unrelatedHelper, documentation} from '../src/routes/accounts.ts';
import {auditCallback} from '../src/routes/orders.ts';

function mockRes() {
  return {
    sent: null,
    send(value) {
      this.sent = value;
      return value;
    }
  };
}

describe('Router registration and order preservation', () => {
  it('preserves route registration count, methods, and paths in order', () => {
    const router = makeRouter();
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

  it('preserves the synchronous route behavior', () => {
    const router = makeRouter();
    const healthRoute = router.routes.find(r => r.path === '/health');
    assert.ok(healthRoute);
    assert.equal(healthRoute.method, 'GET');
    const res = mockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const result = healthRoute.handler({ id: '1' }, res, next);
    assert.equal(result, 'ok');
    assert.equal(res.sent, 'ok');
    assert.equal(nextCalled, false);
  });
});

describe('Async handlers success handling', () => {
  it('handles GET /accounts/:id successfully', async () => {
    const router = makeRouter();
    const route = router.routes[0];
    const res = mockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const result = await route.handler({ id: 'acc-1' }, res, next);
    assert.equal(result, 'account:acc-1');
    assert.equal(res.sent, 'account:acc-1');
    assert.equal(nextCalled, false);
  });

  it('handles POST /accounts (named async function) successfully', async () => {
    const router = makeRouter();
    const route = router.routes[1];
    const res = mockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const result = await route.handler({ id: 'acc-new' }, res, next);
    assert.equal(result, 'created:acc-new');
    assert.equal(res.sent, 'created:acc-new');
    assert.equal(nextCalled, false);
  });

  it('handles GET /orders/:id successfully and preserves inner async operations', async () => {
    const router = makeRouter();
    const route = router.routes[3];
    const res = mockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const result = await route.handler({ id: 'ord-100' }, res, next);
    assert.equal(result, 'ORD-100');
    assert.equal(res.sent, 'ORD-100');
    assert.equal(nextCalled, false);
  });

  it('handles DELETE /orders/:id successfully', async () => {
    const router = makeRouter();
    const route = router.routes[4];
    const res = mockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };
    const result = await route.handler({ id: 'ord-200' }, res, next);
    assert.equal(result, 'deleted:ord-200');
    assert.equal(res.sent, 'deleted:ord-200');
    assert.equal(nextCalled, false);
  });
});

describe('Async handlers error forwarding to next', () => {
  it('forwards error to next on GET /accounts/:id failure without rejecting', async () => {
    const router = makeRouter();
    const route = router.routes[0];
    const res = mockRes();
    let forwardedError = null;
    const next = (err) => { forwardedError = err; };
    const result = await route.handler({ id: 'acc-1', fail: true }, res, next);
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'account read');
    assert.equal(result, undefined);
  });

  it('forwards error to next on POST /accounts failure without rejecting', async () => {
    const router = makeRouter();
    const route = router.routes[1];
    const res = mockRes();
    let forwardedError = null;
    const next = (err) => { forwardedError = err; };
    const result = await route.handler({ id: 'acc-new', fail: true }, res, next);
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'account create');
    assert.equal(result, undefined);
  });

  it('forwards error to next on GET /orders/:id failure without rejecting', async () => {
    const router = makeRouter();
    const route = router.routes[3];
    const res = mockRes();
    let forwardedError = null;
    const next = (err) => { forwardedError = err; };
    const result = await route.handler({ id: 'ord-100', fail: true }, res, next);
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'order read');
    assert.equal(result, undefined);
  });

  it('forwards error to next on DELETE /orders/:id failure without rejecting', async () => {
    const router = makeRouter();
    const route = router.routes[4];
    const res = mockRes();
    let forwardedError = null;
    const next = (err) => { forwardedError = err; };
    const result = await route.handler({ id: 'ord-200', fail: true }, res, next);
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'order delete');
    assert.equal(result, undefined);
  });
});

describe('Unrelated async functions and callbacks are not wrapped', () => {
  it('unrelatedHelper still throws without error forwarding', async () => {
    await assert.rejects(
      async () => { await unrelatedHelper(); },
      { name: 'Error', message: 'helper' }
    );
  });

  it('auditCallback still throws without error forwarding', async () => {
    await assert.rejects(
      async () => { await auditCallback(); },
      { name: 'Error', message: 'audit' }
    );
  });

  it('documentation string is preserved unchanged', () => {
    assert.equal(documentation, "router.get('/fake', async handler)");
  });
});
