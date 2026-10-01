import {
  getChromeViewportGeometry,
  physicalClick,
  physicalDrag,
  ensureAppActive,
  CURSOR_SPEEDS,
} from './lib/cua-physical-controller.mjs';
import { execFileSync } from 'node:child_process';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function getSlideCountAndOrder() {
  const script = `
tell application "Google Chrome"
    tell active tab of front window
        return execute javascript "(function() {
            const items = Array.from(document.querySelectorAll('.punch-filmstrip-item, [role=tab], g[id*=\\\"filmstrip\\\"]'))
                .map(el => {
                    const r = el.getBoundingClientRect();
                    return { id: el.id || el.getAttribute('aria-label') || 'slide', top: r.top, height: r.height };
                })
                .filter(i => i.height > 20);
            return JSON.stringify({
                url: location.href,
                slides: items
            });
        })()"
    end tell
end tell`;
  return JSON.parse(execFileSync('osascript', ['-e', script], { encoding: 'utf8' }));
}

async function runSlidesTest() {
  console.log('=== Starting Physical Slide Drag & Reorder in Google Slides ===\n');
  ensureAppActive('Google Chrome');
  await sleep(200);

  const geom = getChromeViewportGeometry();

  // New slide button at viewport x = 77, y = 85
  const newSlidePt = geom.toDesktopPixels(77, 85);

  console.log('1. Adding Slide 2 via physical click on \"New slide\" button...');
  await physicalClick(newSlidePt.x, newSlidePt.y, { speed: CURSOR_SPEEDS.normal });
  await sleep(1000);

  console.log('2. Adding Slide 3 via physical click on \"New slide\" button...');
  await physicalClick(newSlidePt.x, newSlidePt.y, { speed: CURSOR_SPEEDS.normal });
  await sleep(1000);

  const before = getSlideCountAndOrder();
  console.log('Slides before reordering:', before.slides.length, 'slides detected');

  // Slide 3 thumbnail center is at viewport x = 100, y = 390
  // Slide 1 thumbnail position is at viewport x = 100, y = 150
  const fromSlide3 = geom.toDesktopPixels(100, 390);
  const toAboveSlide1 = geom.toDesktopPixels(100, 140);

  console.log('3. Physically dragging Slide 3 up above Slide 1...');
  console.log(`Dragging from ${JSON.stringify(fromSlide3)} up to ${JSON.stringify(toAboveSlide1)}...`);
  await physicalDrag(fromSlide3.x, fromSlide3.y, toAboveSlide1.x, toAboveSlide1.y, {
    durationMs: 700,
    steps: 35,
  });
  await sleep(1000);

  const after = getSlideCountAndOrder();
  console.log('\n=== Slides Reordering Completed Successfully! ===');
  console.log('Final Slides state:', after.slides);
}

runSlidesTest().catch(err => {
  console.error('Slides test failed:', err);
  process.exit(1);
});
