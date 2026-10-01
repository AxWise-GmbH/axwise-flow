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

/**
 * Ensures the target application is focused and frontmost in macOS WindowServer.
 */
export function ensureAppActive(appName = 'Google Chrome') {
  try {
    execFileSync('osascript', ['-e', `tell application "${appName}" to activate`]);
  } catch (err) {
    console.warn(`Could not activate app ${appName}:`, err.message);
  }
}

/**
 * Reads display dimensions and backing scale factor (e.g. 2.0 on Retina).
 */
export function getDisplayInfo() {
  try {
    const raw = execFileSync('cua-driver', ['call', 'get_screen_size', '{}'], { encoding: 'utf8' });
    return JSON.parse(raw);
  } catch {
    return { width: 1470, height: 956, scale_factor: 2.0 };
  }
}

/**
 * For browser-based apps (Google Sheets, Slides, Excalidraw, Figma in Chrome),
 * reads the exact viewport offset and converts local web coordinates into desktop screenshot pixels.
 */
export function getChromeViewportGeometry() {
  ensureAppActive('Google Chrome');
  const script = `
tell application "Google Chrome"
    tell active tab of front window
        return execute javascript "(function() {
            return JSON.stringify({
                screenX: window.screenX,
                screenY: window.screenY,
                outerHeight: window.outerHeight,
                innerHeight: window.innerHeight,
                innerWidth: window.innerWidth,
                devicePixelRatio: window.devicePixelRatio || 2
            });
        })()"
    end tell
end tell`;

  const raw = execFileSync('osascript', ['-e', script], { encoding: 'utf8' });
  const data = JSON.parse(raw);
  const dpr = data.devicePixelRatio || 2;
  const toolbarHeight = (data.outerHeight - data.innerHeight);
  const viewportScreenX = data.screenX * dpr;
  const viewportScreenY = (data.screenY + toolbarHeight) * dpr;

  return {
    dpr,
    toolbarHeight,
    viewportScreenX,
    viewportScreenY,
    viewportWidth: data.innerWidth * dpr,
    viewportHeight: data.innerHeight * dpr,
    toDesktopPixels(viewportX, viewportY) {
      return {
        x: Math.round(viewportScreenX + viewportX * dpr),
        y: Math.round(viewportScreenY + viewportY * dpr),
      };
    },
  };
}

/**
 * Low-level physical cursor move to desktop pixels (x, y)
 */
export function moveCursor(x, y) {
  execFileSync('cua-driver', ['call', 'move_cursor', JSON.stringify({
    target: { kind: 'desktop', display_id: 'primary' },
    x,
    y,
  })]);
}

/**
 * Smoothly glides cursor across intermediate points with an ease-in-out curve.
 */
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

/**
 * Clicks at exact desktop screenshot pixels (x, y)
 */
export function click(x, y) {
  execFileSync('cua-driver', ['call', 'click', JSON.stringify({
    target: { kind: 'desktop', display_id: 'primary' },
    x,
    y,
  })]);
}

/**
 * Complete visible physical click: glides smoothly to target, dwells, and clicks.
 */
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
  click(x, y);
  await sleep(options.dwellAfterMs ?? 60);
}

/**
 * Complete visible physical drag: moves to start, holds mouse button,
 * drags across path with interpolated steps, and releases at destination.
 * Essential for Google Sheets cell ranges, slide shape movements, and canvas drawing.
 */
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

/**
 * Freehand drawing / stroke creation across an array of waypoints [{x, y}, ...].
 */
export async function drawStroke(points, options = {}) {
  if (!points || points.length < 2) return;
  for (let i = 0; i < points.length - 1; i++) {
    const p1 = points[i];
    const p2 = points[i + 1];
    await physicalDrag(p1.x, p1.y, p2.x, p2.y, {
      durationMs: options.segmentDurationMs ?? 120,
      steps: options.segmentSteps ?? 10,
    });
  }
}

/**
 * Types text into the currently active control.
 */
export function physicalType(text, delayMs = 25) {
  execFileSync('cua-driver', ['call', 'type_text', JSON.stringify({
    target: { kind: 'desktop', display_id: 'primary' },
    text,
    delay_ms: delayMs,
  })]);
}

/**
 * Presses a single key (e.g. 'return', 'tab', 'escape', 'up', 'down').
 */
export function physicalPressKey(key) {
  execFileSync('cua-driver', ['call', 'press_key', JSON.stringify({
    target: { kind: 'desktop', display_id: 'primary' },
    key,
  })]);
}

/**
 * Sends a keyboard shortcut (e.g. ['cmd', 'c'], ['cmd', 'v'], ['shift', 'tab']).
 */
export function physicalHotkey(keys) {
  execFileSync('cua-driver', ['call', 'hotkey', JSON.stringify({
    target: { kind: 'desktop', display_id: 'primary' },
    keys,
  })]);
}
