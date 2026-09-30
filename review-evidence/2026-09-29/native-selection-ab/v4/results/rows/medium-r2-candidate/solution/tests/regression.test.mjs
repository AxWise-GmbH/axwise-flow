import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {makeRouter} from '../src/app.ts';
import {documentation, unrelatedHelper} from '../src/routes/accounts.ts';
import {auditCallback} from '../src/routes/orders.ts';

function createMockRes() {
  return {
    send(value) {
      return 'sent:' + value;
    },
  };
}

describe('Router registration and order', () => {
  test('registers all routes in correct order with correct methods and paths', () => {
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
});

describe('GET /accounts/:id', () => {
  const getRoute = () => makeRouter().routes[0];

  test('successfully handles request and returns response value', async () => {
    const route = getRoute();
    const res = createMockRes();
    let nextCalled = false;
    const result = await route.handler({id: '123'}, res, () => {
      nextCalled = true;
    });
    assert.equal(result, 'sent:account:123');
    assert.equal(nextCalled, false);
  });

  test('forwards rejection error to next', async () => {
    const route = getRoute();
    const res = createMockRes();
    let forwardedError = null;
    await route.handler({id: '123', fail: true}, res, (err) => {
      forwardedError = err;
    });
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'account read');
  });
});

describe('POST /accounts (named async function)', () => {
  const getRoute = () => makeRouter().routes[1];

  test('successfully handles request and returns response value', async () => {
    const route = getRoute();
    const res = createMockRes();
    let nextCalled = false;
    const result = await route.handler({id: '456'}, res, () => {
      nextCalled = true;
    });
    assert.equal(result, 'sent:created:456');
    assert.equal(nextCalled, false);
  });

  test('forwards rejection error to next', async () => {
    const route = getRoute();
    const res = createMockRes();
    let forwardedError = null;
    await route.handler({id: '456', fail: true}, res, (err) => {
      forwardedError = err;
    });
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'account create');
  });
});

describe('GET /health (synchronous route preserved)', () => {
  const getRoute = () => makeRouter().routes[2];

  test('handles request synchronously and is not wrapped with withErrors', () => {
    const route = getRoute();
    const res = createMockRes();
    let nextCalled = false;
    const result = route.handler({id: '0'}, res, () => {
      nextCalled = true;
    });
    assert.equal(result, 'sent:ok');
    assert.equal(nextCalled, false);
    // Ensure the handler is synchronous, not an async function returning a promise
    assert.ok(!(result instanceof Promise));
  });
});

describe('GET /orders/:id', () => {
  const getRoute = () => makeRouter().routes[3];

  test('successfully handles request and preserves inner async map handling', async () => {
    const route = getRoute();
    const res = createMockRes();
    let nextCalled = false;
    const result = await route.handler({id: 'item-xyz'}, res, () => {
      nextCalled = true;
    });
    assert.equal(result, 'sent:ITEM-XYZ');
    assert.equal(nextCalled, false);
  });

  test('forwards rejection error to next', async () => {
    const route = getRoute();
    const res = createMockRes();
    let forwardedError = null;
    await route.handler({id: 'item-xyz', fail: true}, res, (err) => {
      forwardedError = err;
    });
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'order read');
  });
});

describe('DELETE /orders/:id', () => {
  const getRoute = () => makeRouter().routes[4];

  test('successfully handles request and returns response value', async () => {
    const route = getRoute();
    const res = createMockRes();
    let nextCalled = false;
    const result = await route.handler({id: 'order-789'}, res, () => {
      nextCalled = true;
    });
    assert.equal(result, 'sent:deleted:order-789');
    assert.equal(nextCalled, false);
  });

  test('forwards rejection error to next', async () => {
    const route = getRoute();
    const res = createMockRes();
    let forwardedError = null;
    await route.handler({id: 'order-789', fail: true}, res, (err) => {
      forwardedError = err;
    });
    assert.ok(forwardedError instanceof Error);
    assert.equal(forwardedError.message, 'order delete');
  });
});

describe('Unrelated exports and functions remain untouched', () => {
  test('unrelatedHelper still throws directly', async () => {
    await assert.rejects(async () => {
      await unrelatedHelper();
    }, {message: 'helper'});
  });

  test('auditCallback still throws directly', async () => {
    await assert.rejects(async () => {
      await auditCallback();
    }, {message: 'audit'});
  });

  test('documentation string remains unchanged', () => {
    assert.equal(documentation, "router.get('/fake', async handler)");
  });
});
