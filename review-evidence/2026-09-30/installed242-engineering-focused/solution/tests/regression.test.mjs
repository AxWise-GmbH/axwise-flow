import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { makeRouter } from '../src/app.ts';
import { Router } from '../src/framework/router.ts';
import { registerAccounts, documentation, unrelatedHelper } from '../src/routes/accounts.ts';
import { registerOrders, auditCallback } from '../src/routes/orders.ts';

function createMockRes() {
  const calls = [];
  return {
    calls,
    send(value) {
      calls.push(value);
      return value;
    },
  };
}

function createNextTracker() {
  const errors = [];
  const next = (err) => {
    errors.push(err);
  };
  return { errors, next };
}

describe('Router registration and health route', () => {
  it('preserves route registration order and count', () => {
    const router = makeRouter();
    assert.equal(router.routes.length, 5);
    assert.deepEqual(
      router.routes.map((r) => ({ method: r.method, path: r.path })),
      [
        { method: 'GET', path: '/accounts/:id' },
        { method: 'POST', path: '/accounts' },
        { method: 'GET', path: '/health' },
        { method: 'GET', path: '/orders/:id' },
        { method: 'DELETE', path: '/orders/:id' },
      ],
    );
  });

  it('keeps synchronous health route unwrapped and working', () => {
    const router = makeRouter();
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/health');
    assert.ok(route);
    const res = createMockRes();
    const { errors, next } = createNextTracker();
    const result = route.handler({ id: 'test' }, res, next);
    assert.equal(result, 'ok');
    assert.deepEqual(res.calls, ['ok']);
    assert.equal(errors.length, 0);
    assert.equal(result instanceof Promise, false);
  });
});

describe('Accounts routes withErrors wrapping', () => {
  it('handles GET /accounts/:id success path', async () => {
    const router = new Router();
    registerAccounts(router);
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/accounts/:id');
    assert.ok(route);

    const res = createMockRes();
    const { errors, next } = createNextTracker();
    const result = await route.handler({ id: 'acc-123' }, res, next);

    assert.equal(result, 'account:acc-123');
    assert.deepEqual(res.calls, ['account:acc-123']);
    assert.equal(errors.length, 0);
  });

  it('forwards error to next on GET /accounts/:id failure', async () => {
    const router = new Router();
    registerAccounts(router);
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/accounts/:id');
    assert.ok(route);

    const res = createMockRes();
    const { errors, next } = createNextTracker();
    await route.handler({ id: 'acc-123', fail: true }, res, next);

    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof Error);
    assert.equal(errors[0].message, 'account read');
    assert.deepEqual(res.calls, []);
  });

  it('handles POST /accounts named function createAccount success path', async () => {
    const router = new Router();
    registerAccounts(router);
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/accounts');
    assert.ok(route);

    const res = createMockRes();
    const { errors, next } = createNextTracker();
    const result = await route.handler({ id: 'acc-456' }, res, next);

    assert.equal(result, 'created:acc-456');
    assert.deepEqual(res.calls, ['created:acc-456']);
    assert.equal(errors.length, 0);
  });

  it('forwards error to next on POST /accounts failure', async () => {
    const router = new Router();
    registerAccounts(router);
    const route = router.routes.find((r) => r.method === 'POST' && r.path === '/accounts');
    assert.ok(route);

    const res = createMockRes();
    const { errors, next } = createNextTracker();
    await route.handler({ id: 'acc-456', fail: true }, res, next);

    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof Error);
    assert.equal(errors[0].message, 'account create');
    assert.deepEqual(res.calls, []);
  });
});

describe('Orders routes withErrors wrapping', () => {
  it('handles GET /orders/:id success path with Promise.all mapping', async () => {
    const router = new Router();
    registerOrders(router);
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/orders/:id');
    assert.ok(route);

    const res = createMockRes();
    const { errors, next } = createNextTracker();
    const result = await route.handler({ id: 'ord-100' }, res, next);

    assert.equal(result, 'ORD-100');
    assert.deepEqual(res.calls, ['ORD-100']);
    assert.equal(errors.length, 0);
  });

  it('forwards error to next on GET /orders/:id failure', async () => {
    const router = new Router();
    registerOrders(router);
    const route = router.routes.find((r) => r.method === 'GET' && r.path === '/orders/:id');
    assert.ok(route);

    const res = createMockRes();
    const { errors, next } = createNextTracker();
    await route.handler({ id: 'ord-100', fail: true }, res, next);

    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof Error);
    assert.equal(errors[0].message, 'order read');
    assert.deepEqual(res.calls, []);
  });

  it('handles DELETE /orders/:id success path', async () => {
    const router = new Router();
    registerOrders(router);
    const route = router.routes.find((r) => r.method === 'DELETE' && r.path === '/orders/:id');
    assert.ok(route);

    const res = createMockRes();
    const { errors, next } = createNextTracker();
    const result = await route.handler({ id: 'ord-200' }, res, next);

    assert.equal(result, 'deleted:ord-200');
    assert.deepEqual(res.calls, ['deleted:ord-200']);
    assert.equal(errors.length, 0);
  });

  it('forwards error to next on DELETE /orders/:id failure', async () => {
    const router = new Router();
    registerOrders(router);
    const route = router.routes.find((r) => r.method === 'DELETE' && r.path === '/orders/:id');
    assert.ok(route);

    const res = createMockRes();
    const { errors, next } = createNextTracker();
    await route.handler({ id: 'ord-200', fail: true }, res, next);

    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof Error);
    assert.equal(errors[0].message, 'order delete');
    assert.deepEqual(res.calls, []);
  });
});

describe('Unrelated helpers and callbacks unchanged', () => {
  it('leaves documentation string and unrelatedHelper untouched', async () => {
    assert.equal(documentation, "router.get('/fake', async handler)");
    await assert.rejects(async () => {
      await unrelatedHelper();
    }, { message: 'helper' });
  });

  it('leaves auditCallback untouched', async () => {
    await assert.rejects(async () => {
      await auditCallback();
    }, { message: 'audit' });
  });
});
