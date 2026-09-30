import assert from 'node:assert/strict';
import {test} from 'node:test';
import {makeRouter} from '../src/app.ts';
import {unrelatedHelper} from '../src/routes/accounts.ts';
import {auditCallback} from '../src/routes/orders.ts';

test('router maintains registration order, methods, and paths', () => {
  const router = makeRouter();
  const routes = router.routes.map(r => ({method: r.method, path: r.path}));
  assert.deepEqual(routes, [
    {method: 'GET', path: '/accounts/:id'},
    {method: 'POST', path: '/accounts'},
    {method: 'GET', path: '/health'},
    {method: 'GET', path: '/orders/:id'},
    {method: 'DELETE', path: '/orders/:id'},
  ]);
});

test('GET /accounts/:id handles success and returns response value', async () => {
  const router = makeRouter();
  const route = router.routes.find(r => r.method === 'GET' && r.path === '/accounts/:id');
  assert.ok(route);

  const req = {id: '123'};
  const res = {send: val => val};
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  const result = await route.handler(req, res, next);
  assert.equal(result, 'account:123');
  assert.equal(nextCalled, false);
});

test('GET /accounts/:id forwards error to next when request fails', async () => {
  const router = makeRouter();
  const route = router.routes.find(r => r.method === 'GET' && r.path === '/accounts/:id');
  assert.ok(route);

  const req = {id: '123', fail: true};
  const res = {send: val => val};
  let forwardedError = null;
  const next = err => { forwardedError = err; };

  await route.handler(req, res, next);
  assert.ok(forwardedError instanceof Error);
  assert.equal(forwardedError.message, 'account read');
});

test('POST /accounts (named async function) handles success and returns response value', async () => {
  const router = makeRouter();
  const route = router.routes.find(r => r.method === 'POST' && r.path === '/accounts');
  assert.ok(route);

  const req = {id: '456'};
  const res = {send: val => val};
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  const result = await route.handler(req, res, next);
  assert.equal(result, 'created:456');
  assert.equal(nextCalled, false);
});

test('POST /accounts forwards error to next when request fails', async () => {
  const router = makeRouter();
  const route = router.routes.find(r => r.method === 'POST' && r.path === '/accounts');
  assert.ok(route);

  const req = {id: '456', fail: true};
  const res = {send: val => val};
  let forwardedError = null;
  const next = err => { forwardedError = err; };

  await route.handler(req, res, next);
  assert.ok(forwardedError instanceof Error);
  assert.equal(forwardedError.message, 'account create');
});

test('GET /health preserves synchronous route behavior', () => {
  const router = makeRouter();
  const route = router.routes.find(r => r.method === 'GET' && r.path === '/health');
  assert.ok(route);

  const req = {id: 'health'};
  const res = {send: val => val};
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  const result = route.handler(req, res, next);
  assert.equal(result, 'ok');
  assert.equal(nextCalled, false);
});

test('GET /orders/:id handles success and returns response value', async () => {
  const router = makeRouter();
  const route = router.routes.find(r => r.method === 'GET' && r.path === '/orders/:id');
  assert.ok(route);

  const req = {id: 'ord-xyz'};
  const res = {send: val => val};
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  const result = await route.handler(req, res, next);
  assert.equal(result, 'ORD-XYZ');
  assert.equal(nextCalled, false);
});

test('GET /orders/:id forwards error to next when request fails', async () => {
  const router = makeRouter();
  const route = router.routes.find(r => r.method === 'GET' && r.path === '/orders/:id');
  assert.ok(route);

  const req = {id: 'ord-xyz', fail: true};
  const res = {send: val => val};
  let forwardedError = null;
  const next = err => { forwardedError = err; };

  await route.handler(req, res, next);
  assert.ok(forwardedError instanceof Error);
  assert.equal(forwardedError.message, 'order read');
});

test('DELETE /orders/:id handles success and returns response value', async () => {
  const router = makeRouter();
  const route = router.routes.find(r => r.method === 'DELETE' && r.path === '/orders/:id');
  assert.ok(route);

  const req = {id: 'ord-789'};
  const res = {send: val => val};
  let nextCalled = false;
  const next = () => { nextCalled = true; };

  const result = await route.handler(req, res, next);
  assert.equal(result, 'deleted:ord-789');
  assert.equal(nextCalled, false);
});

test('DELETE /orders/:id forwards error to next when request fails', async () => {
  const router = makeRouter();
  const route = router.routes.find(r => r.method === 'DELETE' && r.path === '/orders/:id');
  assert.ok(route);

  const req = {id: 'ord-789', fail: true};
  const res = {send: val => val};
  let forwardedError = null;
  const next = err => { forwardedError = err; };

  await route.handler(req, res, next);
  assert.ok(forwardedError instanceof Error);
  assert.equal(forwardedError.message, 'order delete');
});

test('unrelated async functions and callbacks are not wrapped', async () => {
  await assert.rejects(async () => {
    await auditCallback();
  }, {message: 'audit'});

  await assert.rejects(async () => {
    await unrelatedHelper();
  }, {message: 'helper'});
});
