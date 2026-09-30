import assert from 'node:assert/strict';
import {describe, test} from 'node:test';
import {makeRouter} from '../src/app.ts';
import {auditCallback} from '../src/routes/orders.ts';
import {documentation, unrelatedHelper} from '../src/routes/accounts.ts';

function createRes() {
  return {
    sent: null,
    send(value) {
      this.sent = value;
      return value;
    },
  };
}

function createNext() {
  const errors = [];
  const next = (err) => { errors.push(err); };
  next.errors = errors;
  return next;
}

describe('Router route registration and order', () => {
  test('routes preserve exact registration order, methods, and paths', () => {
    const router = makeRouter();
    assert.equal(router.routes.length, 5);

    const expected = [
      { method: 'GET', path: '/accounts/:id' },
      { method: 'POST', path: '/accounts' },
      { method: 'GET', path: '/health' },
      { method: 'GET', path: '/orders/:id' },
      { method: 'DELETE', path: '/orders/:id' },
    ];

    router.routes.forEach((route, i) => {
      assert.equal(route.method, expected[i].method);
      assert.equal(route.path, expected[i].path);
    });
  });

  test('synchronous health route remains synchronous', () => {
    const router = makeRouter();
    const healthRoute = router.routes.find(r => r.path === '/health');
    assert.ok(healthRoute);

    const res = createRes();
    const next = createNext();
    const result = healthRoute.handler({ id: 'health-check' }, res, next);

    assert.equal(result, 'ok');
    assert.equal(res.sent, 'ok');
    assert.equal(next.errors.length, 0);
  });
});

describe('Async route error forwarding and success handling', () => {
  test('GET /accounts/:id handles success and returns response value', async () => {
    const router = makeRouter();
    const route = router.routes[0];
    const res = createRes();
    const next = createNext();

    const result = await route.handler({ id: 'acc-1' }, res, next);
    assert.equal(result, 'account:acc-1');
    assert.equal(res.sent, 'account:acc-1');
    assert.equal(next.errors.length, 0);
  });

  test('GET /accounts/:id forwards error to next on failure', async () => {
    const router = makeRouter();
    const route = router.routes[0];
    const res = createRes();
    const next = createNext();

    await route.handler({ id: 'acc-1', fail: true }, res, next);
    assert.equal(next.errors.length, 1);
    assert.equal(next.errors[0]?.message, 'account read');
  });

  test('POST /accounts (named async function) handles success', async () => {
    const router = makeRouter();
    const route = router.routes[1];
    const res = createRes();
    const next = createNext();

    const result = await route.handler({ id: 'acc-create' }, res, next);
    assert.equal(result, 'created:acc-create');
    assert.equal(res.sent, 'created:acc-create');
    assert.equal(next.errors.length, 0);
  });

  test('POST /accounts forwards error to next on failure', async () => {
    const router = makeRouter();
    const route = router.routes[1];
    const res = createRes();
    const next = createNext();

    await route.handler({ id: 'acc-create', fail: true }, res, next);
    assert.equal(next.errors.length, 1);
    assert.equal(next.errors[0]?.message, 'account create');
  });

  test('GET /orders/:id handles success', async () => {
    const router = makeRouter();
    const route = router.routes[3];
    const res = createRes();
    const next = createNext();

    const result = await route.handler({ id: 'ord-abc' }, res, next);
    assert.equal(result, 'ORD-ABC');
    assert.equal(res.sent, 'ORD-ABC');
    assert.equal(next.errors.length, 0);
  });

  test('GET /orders/:id forwards error to next on failure', async () => {
    const router = makeRouter();
    const route = router.routes[3];
    const res = createRes();
    const next = createNext();

    await route.handler({ id: 'ord-abc', fail: true }, res, next);
    assert.equal(next.errors.length, 1);
    assert.equal(next.errors[0]?.message, 'order read');
  });

  test('DELETE /orders/:id handles success', async () => {
    const router = makeRouter();
    const route = router.routes[4];
    const res = createRes();
    const next = createNext();

    const result = await route.handler({ id: 'ord-del' }, res, next);
    assert.equal(result, 'deleted:ord-del');
    assert.equal(res.sent, 'deleted:ord-del');
    assert.equal(next.errors.length, 0);
  });

  test('DELETE /orders/:id forwards error to next on failure', async () => {
    const router = makeRouter();
    const route = router.routes[4];
    const res = createRes();
    const next = createNext();

    await route.handler({ id: 'ord-del', fail: true }, res, next);
    assert.equal(next.errors.length, 1);
    assert.equal(next.errors[0]?.message, 'order delete');
  });
});

describe('Unrelated items are not wrapped', () => {
  test('unrelatedHelper rejects directly without next', async () => {
    await assert.rejects(async () => {
      await unrelatedHelper();
    }, { message: 'helper' });
  });

  test('auditCallback rejects directly without next', async () => {
    await assert.rejects(async () => {
      await auditCallback();
    }, { message: 'audit' });
  });

  test('documentation string is preserved', () => {
    assert.equal(documentation, "router.get('/fake', async handler)");
  });
});
