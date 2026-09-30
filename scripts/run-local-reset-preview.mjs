import { execFile, spawn } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { promisify } from 'node:util';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { startLocalDesktopRelay } from '../apps/orqaly/scripts/local-desktop-relay.mjs';

const execute = promisify(execFile);
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [mode, ...args] = process.argv.slice(2);
if (!['--benchmark', '--desktop', '--preview', '--smoke'].includes(mode)) {
  throw new Error('Use --benchmark [benchmark options], --preview [app executable], --desktop [app executable and arguments], or --smoke. Reads existing cloud secrets into relay memory only; never deploys.');
}
const desktopMode = mode === '--desktop' || mode === '--preview';
async function secret(name) {
  try {
    const { stdout } = await execute('gcloud', ['secrets', 'versions', 'access', 'latest',
      '--secret', name, '--project', 'axwise-v2-preview-001'],
    { encoding: 'utf8', timeout: 90_000, maxBuffer: 128_000 });
    return stdout.trim();
  } catch {
    throw new Error(`Could not read the existing ${name} secret; no configuration was changed.`);
  }
}

const environment = { ...process.env, ORQALY_GOOSE_OAUTH_CLIENT_ID: 'UNciLDGl5PPmF9M8' };
const required = {
  ORQALY_GOOSE_GEMINI_API_KEY: 'axwise-v2-preview-001-gemini-api-key',
  TYPESAFE_API_KEY: 'axwise-v2-preview-001-typesafe-api-key',
  ...(desktopMode ? {
    CLERK_SECRET_KEY: 'orqaly-v2-preview-001-clerk-secret-key',
    CLERK_PUBLISHABLE_KEY: 'orqaly-v2-preview-001-clerk-publishable-key',
  } : {}),
};
await Promise.all(Object.entries(required).map(async ([key, name]) => { environment[key] = await secret(name); }));
const localToken = randomBytes(32).toString('hex');
if (!desktopMode) Object.assign(environment, {
  ORQALY_LOCAL_TEST_MODE: 'true', ORQALY_LOCAL_TEST_TOKEN: localToken,
  ORQALY_LOCAL_TEST_USER_ID: 'local-benchmark',
});
else delete environment.ORQALY_LOCAL_TEST_MODE;
const { server, url } = await startLocalDesktopRelay({ environment, port: 0 });
console.log(`Local-only relay ready: ${url}; Axwise routes disabled.`);
let child;
let closing = false;
async function close() {
  if (closing) return;
  closing = true;
  child?.kill('SIGTERM');
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
}
process.once('SIGINT', () => void close());
process.once('SIGTERM', () => void close());
try {
  if (mode === '--smoke') {
    for (const query of ['Give me 3 latest local news headlines in Riga with dates and source links.',
      'Give me 3 latest local news headlines in Liptovský Mikuláš with dates and source links.']) {
      const started = performance.now();
      const response = await fetch(`${url}/desktop/v1/search`, {
        method: 'POST', headers: { Authorization: `Bearer ${localToken}`, 'content-type': 'application/json' },
        body: JSON.stringify({ query }), signal: AbortSignal.timeout(35_000),
      });
      console.log(JSON.stringify({ query, status: response.status, elapsedMs: Math.round(performance.now() - started), result: await response.json() }));
    }
  } else if (mode === '--benchmark' || mode === '--preview' || args.length) {
    const childEnv = { ...process.env };
    for (const key of Object.keys(childEnv)) {
      if (/API_KEY|CLERK_.*KEY|PRIVATE_KEY|SECRET|PASSWORD|ACCESS_TOKEN|REFRESH_TOKEN/.test(key)) delete childEnv[key];
    }
    Object.assign(childEnv, { ORQANIX_LOCAL_API_URL: url, ORQALY_LOCAL_RELAY_URL: url,
      ORQALY_LOCAL_TEST_USER_ID: 'local-benchmark' });
    if (mode === '--benchmark') Object.assign(childEnv, { ORQALY_LOCAL_TEST_MODE: 'true', ORQALY_LOCAL_TEST_TOKEN: localToken });
    else { delete childEnv.ORQALY_LOCAL_TEST_MODE; delete childEnv.ORQALY_LOCAL_TEST_TOKEN; }
    let desktopArgs = args;
    if (mode === '--preview') {
      if (args.length > 1) throw new Error('--preview accepts only an optional app executable; its profile is always isolated.');
      const profile = await mkdtemp(join(tmpdir(), 'orqanix-reset-preview-'));
      await writeFile(join(profile, 'settings.json'), JSON.stringify({
        engineeringCapabilities: { nativeGemsEnabled: false, jevReviewEnabled: true },
      }), { flag: 'wx', mode: 0o600 });
      desktopArgs = [args[0] || '/private/tmp/orqaly-goose-ux-233/ui/desktop/out/Orqanix-darwin-arm64/Orqanix.app/Contents/MacOS/Orqanix',
        `--user-data-dir=${profile}`];
      console.log(`Isolated preview profile: ${profile}; Native engineering off, optional JEV on. Keep native engineering disabled in this local comparison.`);
    }
    child = mode === '--benchmark'
      ? spawn(process.execPath, [join(root, 'scripts/benchmark-goose-reset.mjs'), '--live', ...args], { env: childEnv, stdio: 'inherit' })
      : spawn(desktopArgs[0], desktopArgs.slice(1), { env: childEnv, stdio: 'inherit' });
    const code = await new Promise((resolve, reject) => {
      child.once('error', reject); child.once('exit', (status) => resolve(status ?? 1));
    });
    process.exitCode = code;
  } else {
    console.log('Start the local reset app with ORQANIX_LOCAL_API_URL set to the relay address above. Ctrl-C stops this relay.');
    await new Promise((resolve) => server.once('close', resolve));
  }
} finally { await close(); }
