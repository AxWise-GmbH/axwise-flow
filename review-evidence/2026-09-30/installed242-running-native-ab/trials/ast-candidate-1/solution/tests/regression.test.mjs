import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeRouter} from '../src/app.ts';
import {documentation, unrelatedHelper} from '../src/routes/accounts.ts';
import {auditCallback} from '../src/routes/orders.ts';

function createMockRes() {
  const calls = [];
  return {
    send(value) {
      calls.push(value);
      return value;
    },
    calls,
  };
}

test('route registration order and metadata', () => {
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

test('successful handling for GET /accounts/:id', async () => {
  const router = makeRouter();
  const res = createMockRes();
  let nextCalled = false;
  const result = await router.routes[0].handler({id: 'acc1'}, res, () => {
    nextCalled = true;
  });
  assert.equal(result, 'account:acc1');
  assert.deepEqual(res.calls, ['account:acc1']);
  assert.equal(nextCalled, false);
});

test('error forwarding for GET /accounts/:id', async () => {
  const router = makeRouter();
  const res = createMockRes();
  let forwardedError = null;
  await router.routes[0].handler({id: 'acc1', fail: true}, res, (err) => {
    forwardedError = err;
  });
  assert.ok(forwardedError instanceof Error);
  assert.equal(forwardedError.message, 'account read');
  assert.deepEqual(res.calls, []);
});

test('successful handling for POST /accounts (named function)', async () => {
  const router = makeRouter();
  const res = createMockRes();
  let nextCalled = false;
  const result = await router.routes[1].handler({id: 'acc2'}, res, () => {
    nextCalled = true;
  });
  assert.equal(result, 'created:acc2');
  assert.deepEqual(res.calls, ['created:acc2']);
  assert.equal(nextCalled, false);
});

test('error forwarding for POST /accounts (named function)', async () => {
  const router = makeRouter();
  const res = createMockRes();
  let forwardedError = null;
  await router.routes[1].handler({id: 'acc2', fail: true}, res, (err) => {
    forwardedError = err;
  });
  assert.ok(forwardedError instanceof Error);
  assert.equal(forwardedError.message, 'account create');
  assert.deepEqual(res.calls, []);
});

test('synchronous route /health is preserved and not wrapped with async handler', () => {
  const router = makeRouter();
  const res = createMockRes();
  let nextCalled = false;
  const result = router.routes[2].handler({id: 'any'}, res, () => {
    nextCalled = true;
  });
  // Ensure synchronous execution (not returning a promise)
  assert.equal(result, 'ok');
  assert.equal(result instanceof Promise, false);
  assert.deepEqual(res.calls, ['ok']);
  assert.equal(nextCalled, false);
});

test('successful handling for GET /orders/:id', async () => {
  const router = makeRouter();
  const res = createMockRes();
  let nextCalled = false;
  const result = await router.routes[3].handler({id: 'ord1'}, res, () => {
    nextCalled = true;
  });
  assert.equal(result, 'ORD1');
  assert.deepEqual(res.calls, ['ORD1']);
  assert.equal(nextCalled, false);
});

test('error forwarding for GET /orders/:id', async () => {
  const router = makeRouter();
  const res = createMockRes();
  let forwardedError = null;
  await router.routes[3].handler({id: 'ord1', fail: true}, res, (err) => {
    forwardedError = err;
  });
  assert.ok(forwardedError instanceof Error);
  assert.equal(forwardedError.message, 'order read');
  assert.deepEqual(res.calls, []);
});

test('successful handling for DELETE /orders/:id', async () => {
  const router = makeRouter();
  const res = createMockRes();
  let nextCalled = false;
  const result = await router.routes[4].handler({id: 'ord2'}, res, () => {
    nextCalled = true;
  });
  assert.equal(result, 'deleted:ord2');
  assert.deepEqual(res.calls, ['deleted:ord2']);
  assert.equal(nextCalled, false);
});

test('error forwarding for DELETE /orders/:id', async () => {
  const router = makeRouter();
  const res = createMockRes();
  let forwardedError = null;
  await router.routes[4].handler({id: 'ord2', fail: true}, res, (err) => {
    forwardedError = err;
  });
  assert.ok(forwardedError instanceof Error);
  assert.equal(forwardedError.message, 'order delete');
  assert.deepEqual(res.calls, []);
});

test('unrelated async functions and callbacks are not wrapped', async () => {
  assert.equal(documentation, "router.get('/fake', async handler)");
  await assert.rejects(async () => unrelatedHelper(), {message: 'helper'});
  await assert.rejects(async () => auditCallback(), {message: 'audit'});
});
