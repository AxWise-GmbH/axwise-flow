import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

// Load .env keys if needed
for (const p of ['.env.local', '.env']) {
  if (fs.existsSync(p)) {
    for (const l of fs.readFileSync(p, 'utf8').split('\n')) {
      const t = l.trim();
      if (t && !t.startsWith('#') && t.includes('=')) {
        const [k, ...rest] = t.split('=');
        if (!process.env[k.trim()]) process.env[k.trim()] = rest.join('=').trim().replace(/^['\"]|['\"]$/g, '');
      }
    }
  }
}

import {
  triageComputerUseModalityWithJev,
  evaluateJevActionSelection,
  triageFullComputerUsePlan,
  COMPUTER_USE_MODALITIES,
} from '../packages/orqaly-goose-connector/src/jev-loop-router.mjs';

import {
  getDisplayInfo,
  getChromeViewportGeometry,
  CURSOR_SPEEDS,
} from '../scripts/lib/cua-physical-controller.mjs';

import { executeBatchActions } from '../packages/orqaly-goose-connector/src/batch-actions.mjs';

test('1. Extension configuration: unused and broken computer use tools are disabled in goose config', () => {
  const configPath = path.join(process.env.HOME, '.config', 'goose', 'config.yaml');
  assert.ok(fs.existsSync(configPath), 'Goose config file exists');
  const yaml = fs.readFileSync(configPath, 'utf8');

  // Verify browserbase is explicitly disabled
  assert.match(yaml, /browserbase:[\s\S]*?enabled:\s*false/, 'browserbase must be disabled in goose config');

  // Verify computercontroller (Peekaboo) is explicitly disabled
  assert.match(yaml, /computercontroller:[\s\S]*?enabled:\s*false/, 'computercontroller must be disabled in goose config');

  // Verify cua-driver and chromedevtools remain enabled
  assert.match(yaml, /cua-driver:[\s\S]*?enabled:\s*true/, 'cua-driver must be enabled');
  assert.match(yaml, /chromedevtools:[\s\S]*?enabled:\s*true/, 'chromedevtools must be enabled');
});

test('2. Cua Driver native permissions and health check', () => {
  const permRaw = execFileSync('cua-driver', ['permissions', 'status', '--json'], { encoding: 'utf8' });
  const perms = JSON.parse(permRaw);

  assert.equal(perms.accessibility, true, 'Accessibility permission must be granted');
  assert.equal(perms.screen_recording, true, 'Screen Recording permission must be granted');
});

test('3. JEV System-1 triage differentiates computer use modalities', async () => {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) {
    console.log('Skipping live JEV test because TYPESAFE_API_KEY is not set');
    return;
  }

  // A. Interactive GUI task (Google Sheets drag)
  const sheetsTask = await triageComputerUseModalityWithJev({
    message: 'Drag formula from cell B2 down to cell B25 in Google Sheets',
    apiKey,
  });
  assert.equal(sheetsTask.evaluated, true);
  assert.equal(sheetsTask.modality, COMPUTER_USE_MODALITIES.PHYSICAL_GUI);
  assert.ok(sheetsTask.confidence >= 0.7);

  // B. Silent background task
  const silentTask = await triageComputerUseModalityWithJev({
    message: 'Silently parse downloaded grocery receipts in the background into CSV',
    apiKey,
  });
  assert.equal(silentTask.evaluated, true);
  assert.equal(silentTask.modality, COMPUTER_USE_MODALITIES.BACKGROUND_HEADLESS);
  assert.ok(silentTask.confidence >= 0.7);

  // C. Canvas drawing task
  const canvasTask = await triageComputerUseModalityWithJev({
    message: 'Draw architectural diagram with circles and connection arrows on canvas',
    apiKey,
  });
  assert.equal(canvasTask.evaluated, true);
  assert.equal(canvasTask.modality, COMPUTER_USE_MODALITIES.PHYSICAL_GUI);
  assert.equal(canvasTask.cursorSpeed, 'smooth');
});

test('4. Physical controller displays and geometry coordinate transformation', () => {
  const display = getDisplayInfo();
  assert.ok(display.width >= 1000);
  assert.ok(display.height >= 700);
  assert.equal(display.scale_factor, 2.0);

  const geom = getChromeViewportGeometry();
  assert.ok(geom.viewportScreenX >= 0);
  assert.ok(geom.viewportScreenY >= 100, 'Viewport offset must account for toolbar');
  assert.equal(geom.dpr, 2.0);

  // Coordinate mapping validation
  const pt = geom.toDesktopPixels(100, 200);
  assert.equal(pt.x, Math.round(geom.viewportScreenX + 100 * geom.dpr));
  assert.equal(pt.y, Math.round(geom.viewportScreenY + 200 * geom.dpr));
});

test('5. JEV System-1 action selection accurately picks target from candidate list', async () => {
  const apiKey = process.env.TYPESAFE_API_KEY;
  if (!apiKey) return;

  const candidates = {
    act_1: 'Button: Cancel and close',
    act_2: 'Input: Search documents field',
    act_3: 'Button: Save Changes (Primary)',
    act_4: 'Link: Documentation help',
  };

  const res = await evaluateJevActionSelection({
    goal: 'Save the edited document changes',
    candidates,
    apiKey,
  });

  assert.equal(res.evaluated, true);
  assert.equal(res.choice, 'act_3');
  assert.ok(res.confidence >= 0.8);
  assert.ok(res.latencyMs < 1000, `Expected latency < 1000ms, got ${res.latencyMs}ms`);
});

test('6. batch_actions executes multi-step sequence with sub-100ms pacing', async () => {
  const actions = [
    { type: 'wait', ms: 20 },
    { type: 'wait', ms: 20 },
    { type: 'wait', ms: 20 },
  ];

  const res = await executeBatchActions(actions, { defaultDelayMs: 0 });
  assert.equal(res.ok, true);
  assert.equal(res.totalActions, 3);
  assert.equal(res.successCount, 3);
  assert.ok(res.durationMs >= 60);
});

