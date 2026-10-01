import { execFileSync } from 'node:child_process';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export const CURSOR_SPEEDS = {
  snappy: { steps: 6, delayMs: 8, dwellMs: 60, name: 'Snappy (~50ms)' },
  fast: { steps: 10, delayMs: 10, dwellMs: 80, name: 'Fast (~100ms)' },
  normal: { steps: 18, delayMs: 14, dwellMs: 120, name: 'Normal (~250ms)' },
  smooth: { steps: 28, delayMs: 16, dwellMs: 160, name: 'Smooth (~450ms)' },
};

export function ensureAppActive(appName = 'Google Chrome') {
  try {
    execFileSync('osascript', ['-e', `tell application "${appName}" to activate`]);
  } catch (err) {
    // Non-fatal if application is already frontmost or headless
  }
}

export function moveCursor(x, y) {
  execFileSync('cua-driver', ['call', 'move_cursor', JSON.stringify({
    target: { kind: 'desktop', display_id: 'primary' },
    x,
    y,
  })]);
}

export function click(x, y, button = 'left') {
  execFileSync('cua-driver', ['call', 'click', JSON.stringify({
    target: { kind: 'desktop', display_id: 'primary' },
    x,
    y,
    button,
  })]);
}

export async function smoothGlide(fromX, fromY, toX, toY, speed = CURSOR_SPEEDS.normal) {
  const { steps, delayMs } = speed;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const ease = t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    const curX = Math.round(fromX + (toX - fromX) * ease);
    const curY = Math.round(fromY + (toY - fromY) * ease);

    moveCursor(curX, curY);
    if (delayMs > 0) await sleep(delayMs);
  }
}

export async function physicalClick(x, y, options = {}) {
  const speed = options.speed || CURSOR_SPEEDS.normal;
  const fromX = options.fromX ?? x;
  const fromY = options.fromY ?? y;

  if (fromX !== x || fromY !== y) {
    await smoothGlide(fromX, fromY, x, y, speed);
  } else {
    moveCursor(x, y);
  }

  await sleep(options.dwellBeforeMs ?? speed.dwellMs);
  click(x, y, options.button || 'left');
  await sleep(options.dwellAfterMs ?? 60);
}

export async function physicalDrag(fromX, fromY, toX, toY, options = {}) {
  const durationMs = options.durationMs ?? 350;
  const steps = options.steps ?? 25;

  execFileSync('cua-driver', ['call', 'drag', JSON.stringify({
    target: { kind: 'desktop', display_id: 'primary' },
    from_x: fromX,
    from_y: fromY,
    to_x: toX,
    to_y: toY,
    duration_ms: durationMs,
    steps,
    button: options.button || 'left',
  })]);

  await sleep(options.dwellAfterMs ?? 80);
}

export function physicalType(text, delayMs = 25) {
  execFileSync('cua-driver', ['call', 'type_text', JSON.stringify({
    target: { kind: 'desktop', display_id: 'primary' },
    text,
    delay_ms: delayMs,
  })]);
}

export function physicalPressKey(key) {
  execFileSync('cua-driver', ['call', 'press_key', JSON.stringify({
    target: { kind: 'desktop', display_id: 'primary' },
    key,
  })]);
}

export function physicalHotkey(keys) {
  execFileSync('cua-driver', ['call', 'hotkey', JSON.stringify({
    target: { kind: 'desktop', display_id: 'primary' },
    keys,
  })]);
}

/**
 * Executes a batch of sequential GUI actions at high speed without round-trips to the LLM.
 *
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
            click(act.x, act.y, act.button || 'left');
          } else {
            await physicalClick(act.x, act.y, { speed, dwellBeforeMs: 20, dwellAfterMs: 30, button: act.button });
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
