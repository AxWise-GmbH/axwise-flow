import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {makeRouter} from '../src/app.ts';
import {unrelatedHelper} from '../src/routes/accounts.ts';
import {auditCallback} from '../src/routes/orders.ts';

function createMockRes() {
  const calls = [];
  return {
    send(val) {
      calls.push(val);
      return val;
    },
    calls,
  };
}

describe('Router registrations', () => {
  it('registers all 5 routes in the expected order with correct methods and paths', () => {
    const router = makeRouter();
    assert.equal(router.routes.length, 5);

    assert.equal(router.routes[0].method, 'GET');
    assert.equal(router.routes[0].path, '/accounts/:id');

    assert.equal(router.routes[1].method, 'POST');
    assert.equal(router.routes[1].path, '/accounts');

    assert.equal(router.routes[2].method, 'GET');
    assert.equal(router.routes[2].path, '/health');

    assert.equal(router.routes[3].method, 'GET');
    assert.equal(router.routes[3].path, '/orders/:id');

    assert.equal(router.routes[4].method, 'DELETE');
    assert.equal(router.routes[4].path, '/orders/:id');
  });
});

describe('Successful handling and response preservation', () => {
  it('GET /accounts/:id handles request and returns response', async () => {
    const router = makeRouter();
    const handler = router.routes[0].handler;
    const res = createMockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    const result = await handler({ id: '101', fail: false }, res, next);
    assert.equal(result, 'account:101');
    assert.deepEqual(res.calls, ['account:101']);
    assert.equal(nextCalled, false);
  });

  it('POST /accounts handles request with named createAccount handler', async () => {
    const router = makeRouter();
    const handler = router.routes[1].handler;
    const res = createMockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    const result = await handler({ id: '202', fail: false }, res, next);
    assert.equal(result, 'created:202');
    assert.deepEqual(res.calls, ['created:202']);
    assert.equal(nextCalled, false);
  });

  it('GET /health handles synchronous route', () => {
    const router = makeRouter();
    const handler = router.routes[2].handler;
    const res = createMockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    const result = handler({ id: '0' }, res, next);
    assert.equal(result, 'ok');
    assert.deepEqual(res.calls, ['ok']);
    assert.equal(nextCalled, false);
  });

  it('GET /orders/:id handles request with internal promise mapping', async () => {
    const router = makeRouter();
    const handler = router.routes[3].handler;
    const res = createMockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    const result = await handler({ id: 'ord-303', fail: false }, res, next);
    assert.equal(result, 'ORD-303');
    assert.deepEqual(res.calls, ['ORD-303']);
    assert.equal(nextCalled, false);
  });

  it('DELETE /orders/:id handles deletion request', async () => {
    const router = makeRouter();
    const handler = router.routes[4].handler;
    const res = createMockRes();
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    const result = await handler({ id: 'ord-404', fail: false }, res, next);
    assert.equal(result, 'deleted:ord-404');
    assert.deepEqual(res.calls, ['deleted:ord-404']);
    assert.equal(nextCalled, false);
  });
});

describe('Error forwarding via next', () => {
  it('GET /accounts/:id forwards failure to next', async () => {
    const router = makeRouter();
    const handler = router.routes[0].handler;
    const res = createMockRes();
    const errors = [];
    const next = (err) => { errors.push(err); };

    await handler({ id: '101', fail: true }, res, next);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof Error);
    assert.equal(errors[0].message, 'account read');
    assert.deepEqual(res.calls, []);
  });

  it('POST /accounts forwards failure to next', async () => {
    const router = makeRouter();
    const handler = router.routes[1].handler;
    const res = createMockRes();
    const errors = [];
    const next = (err) => { errors.push(err); };

    await handler({ id: '202', fail: true }, res, next);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof Error);
    assert.equal(errors[0].message, 'account create');
    assert.deepEqual(res.calls, []);
  });

  it('GET /orders/:id forwards failure to next', async () => {
    const router = makeRouter();
    const handler = router.routes[3].handler;
    const res = createMockRes();
    const errors = [];
    const next = (err) => { errors.push(err); };

    await handler({ id: 'ord-303', fail: true }, res, next);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof Error);
    assert.equal(errors[0].message, 'order read');
    assert.deepEqual(res.calls, []);
  });

  it('DELETE /orders/:id forwards failure to next', async () => {
    const router = makeRouter();
    const handler = router.routes[4].handler;
    const res = createMockRes();
    const errors = [];
    const next = (err) => { errors.push(err); };

    await handler({ id: 'ord-404', fail: true }, res, next);
    assert.equal(errors.length, 1);
    assert.ok(errors[0] instanceof Error);
    assert.equal(errors[0].message, 'order delete');
    assert.deepEqual(res.calls, []);
  });
});

describe('Unrelated helpers and callbacks are untouched', () => {
  it('unrelatedHelper throws directly as an unadapted async function', async () => {
    await assert.rejects(
      async () => await unrelatedHelper(),
      { message: 'helper' }
    );
  });

  it('auditCallback rejects directly without error adaptation', async () => {
    await assert.rejects(
      async () => await auditCallback(),
      { message: 'audit' }
    );
  });
});
