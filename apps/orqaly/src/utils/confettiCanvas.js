/**
 * Shared confetti utility that uses a persistent, pre-attached <canvas> element.
 *
 * canvas-confetti's default mode dynamically creates a canvas and appends it to
 * <body>. Under strict Content-Security-Policy headers (e.g. Vercel production)
 * this can silently fail. By creating our own canvas once and passing it to
 * confetti.create(), the library skips its internal DOM injection and always works.
 */
import confettiLib from 'canvas-confetti';

let _canvas = null;
let _confetti = null;

function getConfetti() {
  if (_confetti) return _confetti;

  // Create a full-viewport canvas that sits above everything
  _canvas = document.createElement('canvas');
  _canvas.id = 'app-confetti-canvas';
  _canvas.style.cssText = [
    'position:fixed',
    'inset:0',
    'width:100vw',
    'height:100vh',
    'pointer-events:none',
    'z-index:999998', // below MUI modals (which start at 1000000+) so confetti appears as background
  ].join(';');
  document.body.appendChild(_canvas);

  // confetti.create(canvas, { resize: true }) returns a bound instance
  _confetti = confettiLib.create(_canvas, { resize: true, useWorker: false });
  return _confetti;
}

/**
 * Fire confetti with the given options.
 * Drop-in replacement for `import confetti from 'canvas-confetti'; confetti(opts)`.
 */
export function fireConfetti(opts = {}) {
  try {
    const fire = getConfetti();
    return fire(opts);
  } catch {
    // Absolute last resort — try the default export directly
    try {
      return confettiLib(opts);
    } catch {
      // silently fail
    }
  }
}

/**
 * Fire multiple confetti bursts (array of option objects).
 */
export function fireConfettiBurst(optsList = []) {
  optsList.forEach((opts) => fireConfetti(opts));
}
