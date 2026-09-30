import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {makeRouter} from '../src/app.ts';
import {unrelatedHelper} from '../src/routes/accounts.ts';
import {auditCallback} from '../src/routes/orders.ts';

describe('Router async error handling regression tests', () => {
  const router = makeRouter();

  it('preserves route registration order and methods', () => {
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

  it('successfully handles GET /accounts/:id and preserves response values', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/accounts/:id');
    assert.ok(route);
    const req = {id: 'acc-1'};
    let sent = null;
    const res = {send: val => { sent = val; return val; }};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    const result = await route.handler(req, res, next);
    assert.equal(result, 'account:acc-1');
    assert.equal(sent, 'account:acc-1');
    assert.equal(nextCalled, false);
  });

  it('forwards errors to next on GET /accounts/:id failure', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/accounts/:id');
    assert.ok(route);
    const req = {id: 'acc-1', fail: true};
    const res = {send: val => val};
    let receivedError = null;
    const next = err => { receivedError = err; };

    await route.handler(req, res, next);
    assert.ok(receivedError instanceof Error);
    assert.equal(receivedError.message, 'account read');
  });

  it('successfully handles POST /accounts with named async function', async () => {
    const route = router.routes.find(r => r.method === 'POST' && r.path === '/accounts');
    assert.ok(route);
    const req = {id: 'acc-new'};
    let sent = null;
    const res = {send: val => { sent = val; return val; }};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    const result = await route.handler(req, res, next);
    assert.equal(result, 'created:acc-new');
    assert.equal(sent, 'created:acc-new');
    assert.equal(nextCalled, false);
  });

  it('forwards errors to next on POST /accounts failure', async () => {
    const route = router.routes.find(r => r.method === 'POST' && r.path === '/accounts');
    assert.ok(route);
    const req = {id: 'acc-new', fail: true};
    const res = {send: val => val};
    let receivedError = null;
    const next = err => { receivedError = err; };

    await route.handler(req, res, next);
    assert.ok(receivedError instanceof Error);
    assert.equal(receivedError.message, 'account create');
  });

  it('preserves synchronous handling on GET /health', () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/health');
    assert.ok(route);
    const req = {id: 'h'};
    let sent = null;
    const res = {send: val => { sent = val; return val; }};
    const next = () => {};

    const result = route.handler(req, res, next);
    assert.equal(result, 'ok');
    assert.equal(sent, 'ok');
  });

  it('successfully handles GET /orders/:id and preserves response values', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/orders/:id');
    assert.ok(route);
    const req = {id: 'ord-123'};
    let sent = null;
    const res = {send: val => { sent = val; return val; }};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    const result = await route.handler(req, res, next);
    assert.equal(result, 'ORD-123');
    assert.equal(sent, 'ORD-123');
    assert.equal(nextCalled, false);
  });

  it('forwards errors to next on GET /orders/:id failure', async () => {
    const route = router.routes.find(r => r.method === 'GET' && r.path === '/orders/:id');
    assert.ok(route);
    const req = {id: 'ord-123', fail: true};
    const res = {send: val => val};
    let receivedError = null;
    const next = err => { receivedError = err; };

    await route.handler(req, res, next);
    assert.ok(receivedError instanceof Error);
    assert.equal(receivedError.message, 'order read');
  });

  it('successfully handles DELETE /orders/:id and preserves response values', async () => {
    const route = router.routes.find(r => r.method === 'DELETE' && r.path === '/orders/:id');
    assert.ok(route);
    const req = {id: 'ord-456'};
    let sent = null;
    const res = {send: val => { sent = val; return val; }};
    let nextCalled = false;
    const next = () => { nextCalled = true; };

    const result = await route.handler(req, res, next);
    assert.equal(result, 'deleted:ord-456');
    assert.equal(sent, 'deleted:ord-456');
    assert.equal(nextCalled, false);
  });

  it('forwards errors to next on DELETE /orders/:id failure', async () => {
    const route = router.routes.find(r => r.method === 'DELETE' && r.path === '/orders/:id');
    assert.ok(route);
    const req = {id: 'ord-456', fail: true};
    const res = {send: val => val};
    let receivedError = null;
    const next = err => { receivedError = err; };

    await route.handler(req, res, next);
    assert.ok(receivedError instanceof Error);
    assert.equal(receivedError.message, 'order delete');
  });

  it('leaves unrelated helpers and audit API unwrapped', async () => {
    await assert.rejects(
      async () => { await unrelatedHelper(); },
      {name: 'Error', message: 'helper'}
    );
    await assert.rejects(
      async () => { await auditCallback(); },
      {name: 'Error', message: 'audit'}
    );
  });
});
