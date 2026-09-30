import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeRouter } from '../src/app.ts';
import { auditCallback } from '../src/routes/orders.ts';
import { unrelatedHelper, documentation } from '../src/routes/accounts.ts';

test('routes preserve exact registration order and methods', () => {
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

test('GET /accounts/:id successfully handles requests and preserves response value', async () => {
  const router = makeRouter();
  const route = router.routes[0];
  let nextCalled = false;
  const res = { send: val => `sent:${val}` };
  const result = await route.handler({ id: 'acc-1' }, res, () => { nextCalled = true; });
  assert.equal(result, 'sent:account:acc-1');
  assert.equal(nextCalled, false);
});

test('GET /accounts/:id forwards async errors to next', async () => {
  const router = makeRouter();
  const route = router.routes[0];
  let forwardedError = null;
  const res = { send: val => val };
  await route.handler({ id: 'acc-1', fail: true }, res, err => { forwardedError = err; });
  assert.ok(forwardedError instanceof Error);
  assert.equal(forwardedError.message, 'account read');
});

test('POST /accounts successfully handles requests and preserves response value', async () => {
  const router = makeRouter();
  const route = router.routes[1];
  let nextCalled = false;
  const res = { send: val => `sent:${val}` };
  const result = await route.handler({ id: 'acc-new' }, res, () => { nextCalled = true; });
  assert.equal(result, 'sent:created:acc-new');
  assert.equal(nextCalled, false);
});

test('POST /accounts forwards async errors to next', async () => {
  const router = makeRouter();
  const route = router.routes[1];
  let forwardedError = null;
  const res = { send: val => val };
  await route.handler({ id: 'acc-new', fail: true }, res, err => { forwardedError = err; });
  assert.ok(forwardedError instanceof Error);
  assert.equal(forwardedError.message, 'account create');
});

test('GET /health preserves synchronous route behavior', () => {
  const router = makeRouter();
  const route = router.routes[2];
  const res = { send: val => `sent:${val}` };
  let nextCalled = false;
  const result = route.handler({ id: 'ignored' }, res, () => { nextCalled = true; });
  assert.equal(result, 'sent:ok');
  assert.equal(nextCalled, false);
  assert.equal(route.handler.constructor.name, 'Function');
});

test('GET /orders/:id successfully handles requests and preserves response value', async () => {
  const router = makeRouter();
  const route = router.routes[3];
  let nextCalled = false;
  const res = { send: val => `sent:${val}` };
  const result = await route.handler({ id: 'ord-42' }, res, () => { nextCalled = true; });
  assert.equal(result, 'sent:ORD-42');
  assert.equal(nextCalled, false);
});

test('GET /orders/:id forwards async errors to next', async () => {
  const router = makeRouter();
  const route = router.routes[3];
  let forwardedError = null;
  const res = { send: val => val };
  await route.handler({ id: 'ord-42', fail: true }, res, err => { forwardedError = err; });
  assert.ok(forwardedError instanceof Error);
  assert.equal(forwardedError.message, 'order read');
});

test('DELETE /orders/:id successfully handles requests and preserves response value', async () => {
  const router = makeRouter();
  const route = router.routes[4];
  let nextCalled = false;
  const res = { send: val => `sent:${val}` };
  const result = await route.handler({ id: 'ord-99' }, res, () => { nextCalled = true; });
  assert.equal(result, 'sent:deleted:ord-99');
  assert.equal(nextCalled, false);
});

test('DELETE /orders/:id forwards async errors to next', async () => {
  const router = makeRouter();
  const route = router.routes[4];
  let forwardedError = null;
  const res = { send: val => val };
  await route.handler({ id: 'ord-99', fail: true }, res, err => { forwardedError = err; });
  assert.ok(forwardedError instanceof Error);
  assert.equal(forwardedError.message, 'order delete');
});

test('unrelated helpers and audit callbacks are not wrapped', async () => {
  assert.equal(typeof documentation, 'string');
  await assert.rejects(async () => {
    await auditCallback();
  }, { name: 'Error', message: 'audit' });
  await assert.rejects(async () => {
    await unrelatedHelper();
  }, { name: 'Error', message: 'helper' });
});
