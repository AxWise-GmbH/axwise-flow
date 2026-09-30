import assert from 'node:assert/strict';
import {describe, it} from 'node:test';
import {makeRouter} from '../src/app.ts';
import {unrelatedHelper} from '../src/routes/accounts.ts';
import {auditCallback} from '../src/routes/orders.ts';

describe('Router registrations and error forwarding', () => {
  it('preserves route registration order and methods', () => {
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

  it('handles GET /accounts/:id successfully and forwards errors', async () => {
    const router = makeRouter();
    const route = router.routes[0];
    const res = {send: val => `sent:${val}`};

    let nextCalled = false;
    const result = await route.handler({id: '42'}, res, () => { nextCalled = true; });
    assert.equal(result, 'sent:account:42');
    assert.equal(nextCalled, false);

    let errorPassed = null;
    await route.handler({id: '42', fail: true}, res, (err) => { errorPassed = err; });
    assert.ok(errorPassed instanceof Error);
    assert.equal(errorPassed.message, 'account read');
  });

  it('handles POST /accounts (named async function) successfully and forwards errors', async () => {
    const router = makeRouter();
    const route = router.routes[1];
    const res = {send: val => `sent:${val}`};

    let nextCalled = false;
    const result = await route.handler({id: 'user1'}, res, () => { nextCalled = true; });
    assert.equal(result, 'sent:created:user1');
    assert.equal(nextCalled, false);

    let errorPassed = null;
    await route.handler({id: 'user1', fail: true}, res, (err) => { errorPassed = err; });
    assert.ok(errorPassed instanceof Error);
    assert.equal(errorPassed.message, 'account create');
  });

  it('preserves synchronous /health route without wrapping', () => {
    const router = makeRouter();
    const route = router.routes[2];
    const res = {send: val => `sent:${val}`};

    let nextCalled = false;
    const result = route.handler({}, res, () => { nextCalled = true; });
    assert.equal(result, 'sent:ok');
    assert.equal(nextCalled, false);
    // Verify it is not a Promise (remains strictly synchronous)
    assert.equal(result instanceof Promise, false);
  });

  it('handles GET /orders/:id successfully and forwards errors', async () => {
    const router = makeRouter();
    const route = router.routes[3];
    const res = {send: val => `sent:${val}`};

    let nextCalled = false;
    const result = await route.handler({id: 'order99'}, res, () => { nextCalled = true; });
    assert.equal(result, 'sent:ORDER99');
    assert.equal(nextCalled, false);

    let errorPassed = null;
    await route.handler({id: 'order99', fail: true}, res, (err) => { errorPassed = err; });
    assert.ok(errorPassed instanceof Error);
    assert.equal(errorPassed.message, 'order read');
  });

  it('handles DELETE /orders/:id successfully and forwards errors', async () => {
    const router = makeRouter();
    const route = router.routes[4];
    const res = {send: val => `sent:${val}`};

    let nextCalled = false;
    const result = await route.handler({id: 'order100'}, res, () => { nextCalled = true; });
    assert.equal(result, 'sent:deleted:order100');
    assert.equal(nextCalled, false);

    let errorPassed = null;
    await route.handler({id: 'order100', fail: true}, res, (err) => { errorPassed = err; });
    assert.ok(errorPassed instanceof Error);
    assert.equal(errorPassed.message, 'order delete');
  });

  it('does not wrap unrelated helpers and audit API', async () => {
    await assert.rejects(async () => unrelatedHelper(), {message: 'helper'});
    await assert.rejects(async () => auditCallback(), {message: 'audit'});
  });
});
