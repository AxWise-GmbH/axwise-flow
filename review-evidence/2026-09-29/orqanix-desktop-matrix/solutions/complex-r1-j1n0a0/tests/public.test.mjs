import assert from 'node:assert/strict';
import { test } from 'node:test';
import { fulfillOrders } from '../src/orders.mjs';
test('no orders preserve stock', () => assert.deepEqual(fulfillOrders({a:3}, []), {acceptedIds:[],rejected:[],remaining:{a:3}}));
