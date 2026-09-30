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

/**
 * Executes visual OCR & icon detection via cua-perception ONNX runtime worker.
 * @param {Buffer|string} imageSource - PNG image Buffer or file path.
 * @returns {Promise<{ latencyMs: number, regions: Array, textRegions: Array, iconRegions: Array }>}
 */
export async function parseVisualRegions(imageSource) {
  const imageBuffer = typeof imageSource === 'string'
    ? fs.readFileSync(imageSource)
    : imageSource;

  const width = imageBuffer.readUInt32BE(16);
  const height = imageBuffer.readUInt32BE(20);

  return new Promise((resolve, reject) => {
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

    const started = performance.now();
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
            if (result.status === 'ok') {
              const regions = result.result?.regions || [];
              const textRegions = regions.filter(r => r.kind === 'text');
              const iconRegions = regions.filter(r => r.kind === 'icon');

              resolve({
                latencyMs,
                regions,
                textRegions,
                iconRegions,
                raw: result,
              });
            } else {
              reject(new Error(`Perception worker error: ${JSON.stringify(result.error)}`));
            }
          } catch (e) {
            reject(e);
          } finally {
            proc.kill();
          }
        }
      }
    });

    proc.on('error', err => reject(err));

    const request = {
      protocol: 'cua-perception/1',
      request_id: `parse-${Date.now()}`,
      method: 'parse',
      params: {
        capture_id: `cap-${Date.now()}`,
        image: {
          media_type: 'image/png',
          width,
          height,
          byte_length: imageBuffer.length,
          data_base64: imageBuffer.toString('base64'),
        },
      },
    };

    const jsonBuf = Buffer.from(JSON.stringify(request), 'utf8');
    const lenBuf = Buffer.alloc(4);
    lenBuf.writeUInt32BE(jsonBuf.length, 0);

    proc.stdin.write(lenBuf);
    proc.stdin.write(jsonBuf);
  });
}

/**
 * Searches detected regions for matching text query.
 * @param {Array} textRegions
 * @param {string} query
 * @returns {Object|null}
 */
export function findTextRegion(textRegions, query) {
  const q = query.toLowerCase();
  return (
    textRegions.find(r => r.text?.toLowerCase().includes(q)) ||
    textRegions.find(r => q.includes(r.text?.toLowerCase())) ||
    null
  );
}

/**
 * Computes center click point in screenshot pixel coordinates.
 * @param {Object} bounds - { x, y, width, height }
 * @returns {{ x: number, y: number }}
 */
export function getRegionCenter(bounds) {
  return {
    x: Math.round(bounds.x + bounds.width / 2),
    y: Math.round(bounds.y + bounds.height / 2),
  };
}
