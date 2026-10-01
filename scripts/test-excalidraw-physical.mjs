import {
  getChromeViewportGeometry,
  physicalClick,
  physicalDrag,
  drawStroke,
  physicalPressKey,
  CURSOR_SPEEDS,
  ensureAppActive,
} from './lib/cua-physical-controller.mjs';

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runExcalidrawDemo() {
  console.log('=== Starting Physical Canvas Drawing on Excalidraw ===\n');
  ensureAppActive('Google Chrome');
  await sleep(200);

  // Press Escape to dismiss any popups
  physicalPressKey('escape');
  await sleep(150);

  const geom = getChromeViewportGeometry();

  // 1. Select Rectangle Tool
  console.log('1. Selecting Rectangle Tool...');
  const rectBtn = geom.toDesktopPixels(615, 38);
  await physicalClick(rectBtn.x, rectBtn.y, { speed: CURSOR_SPEEDS.normal });
  await sleep(200);

  // 2. Draw Rectangle
  console.log('2. Physically dragging to draw Rectangle on Canvas (300,200 -> 520,360)...');
  const rStart = geom.toDesktopPixels(300, 200);
  const rEnd = geom.toDesktopPixels(520, 360);
  await physicalDrag(rStart.x, rStart.y, rEnd.x, rEnd.y, { durationMs: 450, steps: 25 });
  await sleep(250);

  // 3. Select Ellipse Tool
  console.log('3. Selecting Ellipse Tool...');
  const ellipseBtn = geom.toDesktopPixels(695, 38);
  await physicalClick(ellipseBtn.x, ellipseBtn.y, { speed: CURSOR_SPEEDS.normal });
  await sleep(200);

  // 4. Draw Ellipse
  console.log('4. Physically dragging to draw Ellipse on Canvas (620,200 -> 800,360)...');
  const eStart = geom.toDesktopPixels(620, 200);
  const eEnd = geom.toDesktopPixels(800, 360);
  await physicalDrag(eStart.x, eStart.y, eEnd.x, eEnd.y, { durationMs: 450, steps: 25 });
  await sleep(250);

  // 5. Select Arrow Tool
  console.log('5. Selecting Arrow Tool...');
  const arrowBtn = geom.toDesktopPixels(735, 38);
  await physicalClick(arrowBtn.x, arrowBtn.y, { speed: CURSOR_SPEEDS.normal });
  await sleep(200);

  // 6. Draw Arrow connecting Rectangle to Ellipse
  console.log('6. Physically drawing Arrow from Rectangle to Ellipse (520,280 -> 620,280)...');
  const aStart = geom.toDesktopPixels(520, 280);
  const aEnd = geom.toDesktopPixels(620, 280);
  await physicalDrag(aStart.x, aStart.y, aEnd.x, aEnd.y, { durationMs: 350, steps: 20 });
  await sleep(250);

  // 7. Select Freehand Draw Tool
  console.log('7. Selecting Freehand Draw Tool...');
  const drawBtn = geom.toDesktopPixels(815, 38);
  await physicalClick(drawBtn.x, drawBtn.y, { speed: CURSOR_SPEEDS.normal });
  await sleep(200);

  // 8. Draw smooth curved checkmark / smile
  console.log('8. Drawing smooth freehand curve with kinematics...');
  const waypoints = [
    geom.toDesktopPixels(420, 440),
    geom.toDesktopPixels(460, 480),
    geom.toDesktopPixels(540, 490),
    geom.toDesktopPixels(640, 450),
    geom.toDesktopPixels(720, 410),
  ];
  await drawStroke(waypoints, { segmentDurationMs: 120, segmentSteps: 12 });

  console.log('\n=== Physical Canvas Drawing Completed Successfully! ===');
}

runExcalidrawDemo().catch(err => {
  console.error('Canvas drawing failed:', err);
  process.exit(1);
});
