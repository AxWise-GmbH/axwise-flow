import assert from 'node:assert/strict';
import {describe, it, test} from 'node:test';
import {makeRouter} from '../src/app.ts';
import {documentation, unrelatedHelper} from '../src/routes/accounts.ts';
import {auditCallback} from '../src/routes/orders.ts';

test('router registers routes in expected order with correct methods and paths', () => {
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

test('GET /accounts/:id handles success and forwards failure to next', async () => {
  const router = makeRouter();
  const route = router.routes[0];
  const res = { send: (v) => v };

  let nextCalledWith = null;
  const next = (err) => { nextCalledWith = err; };

  const successResult = await route.handler({ id: 'acc-1' }, res, next);
  assert.equal(successResult, 'account:acc-1');
  assert.equal(nextCalledWith, null);

  const failResult = await route.handler({ id: 'acc-1', fail: true }, res, next);
  assert.equal(failResult, undefined);
  assert.ok(nextCalledWith instanceof Error);
  assert.equal(nextCalledWith.message, 'account read');
});

test('POST /accounts (named async function) handles success and forwards failure to next', async () => {
  const router = makeRouter();
  const route = router.routes[1];
  const res = { send: (v) => v };

  let nextCalledWith = null;
  const next = (err) => { nextCalledWith = err; };

  const successResult = await route.handler({ id: 'acc-2' }, res, next);
  assert.equal(successResult, 'created:acc-2');
  assert.equal(nextCalledWith, null);

  const failResult = await route.handler({ id: 'acc-2', fail: true }, res, next);
  assert.equal(failResult, undefined);
  assert.ok(nextCalledWith instanceof Error);
  assert.equal(nextCalledWith.message, 'account create');
});

test('GET /health preserves synchronous route behavior', () => {
  const router = makeRouter();
  const route = router.routes[2];
  const res = { send: (v) => v };

  let nextCalledWith = null;
  const next = (err) => { nextCalledWith = err; };

  const result = route.handler({ id: 'h' }, res, next);
  assert.equal(result, 'ok');
  assert.equal(nextCalledWith, null);
});

test('GET /orders/:id handles success and forwards failure to next', async () => {
  const router = makeRouter();
  const route = router.routes[3];
  const res = { send: (v) => v };

  let nextCalledWith = null;
  const next = (err) => { nextCalledWith = err; };

  const successResult = await route.handler({ id: 'ord-123' }, res, next);
  assert.equal(successResult, 'ORD-123');
  assert.equal(nextCalledWith, null);

  const failResult = await route.handler({ id: 'ord-123', fail: true }, res, next);
  assert.equal(failResult, undefined);
  assert.ok(nextCalledWith instanceof Error);
  assert.equal(nextCalledWith.message, 'order read');
});

test('DELETE /orders/:id handles success and forwards failure to next', async () => {
  const router = makeRouter();
  const route = router.routes[4];
  const res = { send: (v) => v };

  let nextCalledWith = null;
  const next = (err) => { nextCalledWith = err; };

  const successResult = await route.handler({ id: 'ord-999' }, res, next);
  assert.equal(successResult, 'deleted:ord-999');
  assert.equal(nextCalledWith, null);

  const failResult = await route.handler({ id: 'ord-999', fail: true }, res, next);
  assert.equal(failResult, undefined);
  assert.ok(nextCalledWith instanceof Error);
  assert.equal(nextCalledWith.message, 'order delete');
});

test('unrelated exports, helpers, and audit APIs are not wrapped', async () => {
  assert.equal(documentation, "router.get('/fake', async handler)");
  await assert.rejects(async () => { await unrelatedHelper(); }, { message: 'helper' });
  await assert.rejects(async () => { await auditCallback(); }, { message: 'audit' });
});
