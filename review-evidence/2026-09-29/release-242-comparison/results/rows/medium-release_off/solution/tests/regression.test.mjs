import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {makeRouter} from '../src/app.ts';
import {documentation, unrelatedHelper} from '../src/routes/accounts.ts';
import {auditCallback} from '../src/routes/orders.ts';

describe('Router registration order and sync route preservation', () => {
  it('preserves registration order and methods across all routes', () => {
    const router = makeRouter();
    assert.equal(router.routes.length, 5);
    assert.deepEqual(
      router.routes.map(r => ({method: r.method, path: r.path})),
      [
        {method: 'GET', path: '/accounts/:id'},
        {method: 'POST', path: '/accounts'},
        {method: 'GET', path: '/health'},
        {method: 'GET', path: '/orders/:id'},
        {method: 'DELETE', path: '/orders/:id'},
      ]
    );
  });

  it('keeps synchronous /health route preserved and functional', () => {
    const router = makeRouter();
    const healthRoute = router.routes.find(r => r.path === '/health');
    assert.ok(healthRoute);
    const mockRes = {send: (val) => val};
    let nextCalled = false;
    const result = healthRoute.handler({id: '1'}, mockRes, () => { nextCalled = true; });
    assert.equal(result, 'ok');
    assert.equal(nextCalled, false);
  });
});

describe('Async route successful handling', () => {
  it('handles GET /accounts/:id successfully and preserves response value', async () => {
    const router = makeRouter();
    const route = router.routes[0];
    const mockRes = {send: (val) => `sent:${val}`};
    let nextCalled = false;
    const result = await route.handler({id: 'user1'}, mockRes, () => { nextCalled = true; });
    assert.equal(result, 'sent:account:user1');
    assert.equal(nextCalled, false);
  });

  it('handles POST /accounts successfully and preserves response value', async () => {
    const router = makeRouter();
    const route = router.routes[1];
    const mockRes = {send: (val) => `sent:${val}`};
    let nextCalled = false;
    const result = await route.handler({id: 'user2'}, mockRes, () => { nextCalled = true; });
    assert.equal(result, 'sent:created:user2');
    assert.equal(nextCalled, false);
  });

  it('handles GET /orders/:id successfully and preserves response value', async () => {
    const router = makeRouter();
    const route = router.routes[3];
    const mockRes = {send: (val) => `sent:${val}`};
    let nextCalled = false;
    const result = await route.handler({id: 'item99'}, mockRes, () => { nextCalled = true; });
    assert.equal(result, 'sent:ITEM99');
    assert.equal(nextCalled, false);
  });

  it('handles DELETE /orders/:id successfully and preserves response value', async () => {
    const router = makeRouter();
    const route = router.routes[4];
    const mockRes = {send: (val) => `sent:${val}`};
    let nextCalled = false;
    const result = await route.handler({id: 'item100'}, mockRes, () => { nextCalled = true; });
    assert.equal(result, 'sent:deleted:item100');
    assert.equal(nextCalled, false);
  });
});

describe('Async route error forwarding to next', () => {
  it('forwards GET /accounts/:id failure to next', async () => {
    const router = makeRouter();
    const route = router.routes[0];
    const mockRes = {send: (val) => val};
    let forwardedError = null;
    await route.handler({id: 'user1', fail: true}, mockRes, (err) => {
      forwardedError = err;
    });
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'account read');
  });

  it('forwards POST /accounts failure to next (named async function)', async () => {
    const router = makeRouter();
    const route = router.routes[1];
    const mockRes = {send: (val) => val};
    let forwardedError = null;
    await route.handler({id: 'user2', fail: true}, mockRes, (err) => {
      forwardedError = err;
    });
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'account create');
  });

  it('forwards GET /orders/:id failure to next', async () => {
    const router = makeRouter();
    const route = router.routes[3];
    const mockRes = {send: (val) => val};
    let forwardedError = null;
    await route.handler({id: 'item99', fail: true}, mockRes, (err) => {
      forwardedError = err;
    });
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'order read');
  });

  it('forwards DELETE /orders/:id failure to next', async () => {
    const router = makeRouter();
    const route = router.routes[4];
    const mockRes = {send: (val) => val};
    let forwardedError = null;
    await route.handler({id: 'item100', fail: true}, mockRes, (err) => {
      forwardedError = err;
    });
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'order delete');
  });
});

describe('Unrelated helpers and callbacks are untouched', () => {
  it('leaves documentation unchanged', () => {
    assert.equal(documentation, "router.get('/fake', async handler)");
  });

  it('leaves unrelatedHelper untouched', async () => {
    await assert.rejects(async () => {
      await unrelatedHelper();
    }, {
      name: 'Error',
      message: 'helper',
    });
  });

  it('leaves auditCallback untouched', async () => {
    await assert.rejects(async () => {
      await auditCallback();
    }, {
      name: 'Error',
      message: 'audit',
    });
  });
});
