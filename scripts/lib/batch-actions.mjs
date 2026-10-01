import { execFileSync } from 'node:child_process';
import {
  physicalClick,
  physicalDrag,
  physicalType,
  physicalPressKey,
  physicalHotkey,
  ensureAppActive,
  CURSOR_SPEEDS,
} from './cua-physical-controller.mjs';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Supported action types:
 * - activate: { type: 'activate', appName: 'Google Chrome' }
 * - click: { type: 'click', x: 100, y: 200, button?: 'left'|'right', speed?: 'snappy'|'fast'|'normal'|'instant' }
 * - double_click: { type: 'double_click', x: 100, y: 200 }
 * - drag: { type: 'drag', fromX: 100, fromY: 200, toX: 300, toY: 400, durationMs?: 250, steps?: 15 }
 * - type: { type: 'type', text: 'hello world', delayMs?: 20 }
 * - key: { type: 'key', key: 'return'|'tab'|'escape'|... }
 * - hotkey: { type: 'hotkey', keys: ['cmd', 'c'] }
 * - wait: { type: 'wait', ms: 100 }
 */

export async function executeBatchActions(actions, options = {}) {
  const started = performance.now();
  const stopOnError = options.stopOnError ?? true;
  const defaultDelayMs = options.defaultDelayMs ?? 40;
  const targetApp = options.appName;

  if (targetApp) {
    ensureAppActive(targetApp);
    await sleep(60);
  }

  const results = [];
  let successCount = 0;

  for (let i = 0; i < actions.length; i++) {
    const act = actions[i];
    const actionStart = performance.now();

    try {
      switch (act.type) {
        case 'activate': {
          ensureAppActive(act.appName || 'Google Chrome');
          await sleep(act.dwellMs ?? 80);
          break;
        }

        case 'click': {
          const speed = act.speed === 'instant' ? null : (CURSOR_SPEEDS[act.speed] || CURSOR_SPEEDS.snappy);
          if (!speed) {
            // Direct immediate click via cua-driver
            execFileSync('cua-driver', ['call', 'click', JSON.stringify({
              target: { kind: 'desktop', display_id: 'primary' },
              x: act.x,
              y: act.y,
              button: act.button || 'left',
            })]);
          } else {
            await physicalClick(act.x, act.y, { speed, dwellBeforeMs: 20, dwellAfterMs: 30 });
          }
          break;
        }

        case 'double_click': {
          execFileSync('cua-driver', ['call', 'click', JSON.stringify({
            target: { kind: 'desktop', display_id: 'primary' },
            x: act.x,
            y: act.y,
            count: 2,
          })]);
          break;
        }

        case 'drag': {
          await physicalDrag(act.fromX, act.fromY, act.toX, act.toY, {
            durationMs: act.durationMs ?? 200,
            steps: act.steps ?? 15,
            button: act.button || 'left',
          });
          break;
        }

        case 'type': {
          physicalType(act.text, act.delayMs ?? 15);
          break;
        }

        case 'key': {
          physicalPressKey(act.key);
          break;
        }

        case 'hotkey': {
          physicalHotkey(act.keys);
          break;
        }

        case 'wait': {
          await sleep(act.ms ?? defaultDelayMs);
          break;
        }

        default:
          throw new Error(`Unsupported batch action type: ${act.type}`);
      }

      const actionDurationMs = Math.round(performance.now() - actionStart);
      results.push({
        index: i,
        type: act.type,
        status: 'ok',
        durationMs: actionDurationMs,
      });
      successCount++;

      // Small inter-action pacing if not specified
      if (defaultDelayMs > 0 && i < actions.length - 1 && act.type !== 'wait') {
        await sleep(defaultDelayMs);
      }
    } catch (err) {
      const actionDurationMs = Math.round(performance.now() - actionStart);
      results.push({
        index: i,
        type: act.type,
        status: 'error',
        error: err.message,
        durationMs: actionDurationMs,
      });

      if (stopOnError) {
        break;
      }
    }
  }

  const totalDurationMs = Math.round(performance.now() - started);

  return {
    ok: successCount === actions.length,
    totalActions: actions.length,
    executedCount: results.length,
    successCount,
    durationMs: totalDurationMs,
    results,
  };
}
