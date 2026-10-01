import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CURSOR_SPEEDS,
  getDisplayInfo,
  getChromeViewportGeometry,
  smoothGlide,
} from './cua-physical-controller.mjs';

test('CURSOR_SPEEDS contains valid presets with timing', () => {
  assert.ok(CURSOR_SPEEDS.snappy.steps > 0);
  assert.ok(CURSOR_SPEEDS.fast.steps > CURSOR_SPEEDS.snappy.steps);
  assert.ok(CURSOR_SPEEDS.normal.steps > CURSOR_SPEEDS.fast.steps);
  assert.ok(CURSOR_SPEEDS.smooth.steps > CURSOR_SPEEDS.normal.steps);
  assert.equal(typeof CURSOR_SPEEDS.normal.name, 'string');
});

test('getDisplayInfo returns valid screen bounds and scale', () => {
  const display = getDisplayInfo();
  assert.ok(display.width >= 1000);
  assert.ok(display.height >= 700);
  assert.ok(display.scale_factor >= 1.0);
});

test('getChromeViewportGeometry calculates pixel offsets correctly', () => {
  const geom = getChromeViewportGeometry();
  assert.ok(geom.dpr >= 1);
  assert.ok(geom.toolbarHeight > 0);
  assert.ok(geom.viewportScreenY > 0);

  // Test web coordinate conversion (e.g. Google Sheets cell A1 at web viewport 100, 150)
  const cell = geom.toDesktopPixels(100, 150);
  assert.equal(cell.x, Math.round(geom.viewportScreenX + 100 * geom.dpr));
  assert.equal(cell.y, Math.round(geom.viewportScreenY + 150 * geom.dpr));
});
