import { describe, it } from 'node:test';
import assert from 'node:assert';
import fs from 'node:fs';
import {
  parseVisualRegions,
  findTextRegion,
  getRegionCenter,
} from './visual-perception-driver.mjs';

describe('Visual Perception Driver Pipeline', () => {
  const sampleCapture = '/tmp/canvas_capture.png';

  it('verifies visual parsing on canvas capture', async (t) => {
    if (!fs.existsSync(sampleCapture)) {
      t.skip('Sample capture not found');
      return;
    }

    const res = await parseVisualRegions(sampleCapture);
    assert.strictEqual(typeof res.latencyMs, 'number');
    assert.ok(res.regions.length > 0, 'Should find visual regions');
    assert.ok(res.textRegions.length > 0, 'Should detect text with PP-OCR v5');
    assert.ok(res.iconRegions.length > 0, 'Should detect icons with OmniParser v2.0');

    // Test finding text region
    const pipelineBtn = findTextRegion(res.textRegions, 'PIPELINE');
    assert.ok(pipelineBtn, 'Should find PIPELINE button text');
    assert.ok(pipelineBtn.confidence > 0.5, 'Confidence should exceed 0.5');

    // Test center computation
    const center = getRegionCenter(pipelineBtn.bounds);
    assert.ok(center.x > 0);
    assert.ok(center.y > 0);
  });
});
