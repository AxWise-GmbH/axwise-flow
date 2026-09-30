import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';

const PERCEPTION_DIR = path.join(
  process.env.HOME,
  '.cua-driver/extensions/cua-perception/versions/0.2.1'
);
const BIN_PATH = path.join(PERCEPTION_DIR, 'bin/cua-perception');
const MANIFEST_PATH = path.join(PERCEPTION_DIR, 'model-manifest.json');
const ONNX_LIB_PATH = path.join(PERCEPTION_DIR, 'runtime/libonnxruntime.dylib');

const screenshotPath = '/tmp/canvas_capture.png';
if (!fs.existsSync(screenshotPath)) {
  console.error(`Missing screenshot at ${screenshotPath}`);
  process.exit(1);
}

const imageBuffer = fs.readFileSync(screenshotPath);
const base64Data = imageBuffer.toString('base64');

// Read PNG dimensions from IHDR chunk (bytes 16-24)
const width = imageBuffer.readUInt32BE(16);
const height = imageBuffer.readUInt32BE(20);

console.log(`Loaded capture: ${width}x${height}px, ${imageBuffer.length} bytes`);

const proc = spawn(
  BIN_PATH,
  [
    '--manifest',
    MANIFEST_PATH,
    '--onnx-runtime-library',
    ONNX_LIB_PATH,
    '--extension-id',
    'cua-perception',
    '--extension-version',
    '0.2.1',
  ],
  {
    cwd: PERCEPTION_DIR,
    stdio: ['pipe', 'pipe', 'inherit'],
  }
);

let responseBuffer = Buffer.alloc(0);
proc.stdout.on('data', chunk => {
  responseBuffer = Buffer.concat([responseBuffer, chunk]);
  if (responseBuffer.length >= 4) {
    const expectedLen = responseBuffer.readUInt32BE(0);
    if (responseBuffer.length >= 4 + expectedLen) {
      const payload = responseBuffer.subarray(4, 4 + expectedLen).toString('utf8');
      const latencyMs = Math.round(performance.now() - started);
      try {
        const result = JSON.parse(payload);
        console.log(`\n=== Visual OCR & OmniParser Results (${latencyMs}ms) ===`);
        console.log(`Status: ${result.status}`);
        if (result.status === 'ok') {
          const regions = result.result?.regions || [];
          const textRegions = regions.filter(r => r.kind === 'text');
          const iconRegions = regions.filter(r => r.kind === 'icon');
          console.log(`Total regions detected: ${regions.length}`);
          console.log(`Text regions (PP-OCR v5): ${textRegions.length}`);
          console.log(`Icon/Button regions (OmniParser v2.0): ${iconRegions.length}`);

          console.log('\n--- Detected Canvas Text Lines ---');
          for (const t of textRegions) {
            console.log(`  [conf: ${(t.confidence * 100).toFixed(1)}%] "${t.text}" at [${t.bounds.x}, ${t.bounds.y}, ${t.bounds.width}, ${t.bounds.height}]`);
          }

          console.log('\n--- Detected Canvas Interactive Elements / Icons ---');
          for (const icon of iconRegions) {
            console.log(`  [conf: ${(icon.confidence * 100).toFixed(1)}%] at [${icon.bounds.x}, ${icon.bounds.y}, ${icon.bounds.width}, ${icon.bounds.height}]`);
          }

          // Save detailed artifact
          fs.writeFileSync(
            'docs/canvas-ocr-benchmark-report.json',
            JSON.stringify({ latencyMs, totalRegions: regions.length, textRegions, iconRegions, raw: result }, null, 2)
          );
          console.log('\nSaved report to docs/canvas-ocr-benchmark-report.json');
        } else {
          console.error('Error in response:', result);
        }
      } catch (e) {
        console.error('Failed to parse json payload:', e);
      }
      proc.kill();
      process.exit(0);
    }
  }
});

const request = {
  protocol: 'cua-perception/1',
  request_id: 'canvas-ocr-eval-1',
  method: 'parse',
  params: {
    capture_id: 'canvas-test-capture',
    image: {
      media_type: 'image/png',
      width,
      height,
      byte_length: imageBuffer.length,
      data_base64: base64Data,
    },
  },
};

const jsonBuf = Buffer.from(JSON.stringify(request), 'utf8');
const lenBuf = Buffer.alloc(4);
lenBuf.writeUInt32BE(jsonBuf.length, 0);

const started = performance.now();
proc.stdin.write(lenBuf);
proc.stdin.write(jsonBuf);
