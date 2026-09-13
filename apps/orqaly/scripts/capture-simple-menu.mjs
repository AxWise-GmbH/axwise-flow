import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import fs from 'node:fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '..');
const outDir = path.join(root, 'docs/screenshots');
const port = 5199;

function waitForServer(ms = 15000) {
  return new Promise((resolve, reject) => {
    const start = Date.now();
    const tick = async () => {
      try {
        const res = await fetch(`http://127.0.0.1:${port}/`);
        if (res.ok) return resolve();
      } catch {
        /* retry */
      }
      if (Date.now() - start > ms) return reject(new Error('Vite did not start'));
      setTimeout(tick, 250);
    };
    tick();
  });
}

fs.mkdirSync(outDir, { recursive: true });

const vite = spawn(
  'npx',
  ['vite', '--config', path.join(root, 'scripts/menu-screenshot/vite.config.mjs'), '--port', String(port), '--host', '127.0.0.1'],
  { cwd: root, stdio: 'pipe', shell: true },
);

try {
  await waitForServer();
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
  });
  await page.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const beforePath = path.join(outDir, 'simple-menu-before.png');
  const nowPath = path.join(outDir, 'simple-menu-now.png');
  const comparePath = path.join(outDir, 'simple-menu-compare.png');

  await page.locator('[data-testid="menu-before"]').screenshot({ path: beforePath });
  await page.locator('[data-testid="menu-now"]').screenshot({ path: nowPath });
  await page.screenshot({ path: comparePath, fullPage: true });

  await browser.close();
  console.log(JSON.stringify({ beforePath, nowPath, comparePath }));
} finally {
  vite.kill('SIGTERM');
}
