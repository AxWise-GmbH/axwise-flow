#!/usr/bin/env node
/** Real running Electron UI, opt-in inference. Never installs or launches an app. */
import { createHash, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { spawnSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { isAbsolute, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

export const CASES = Object.freeze([
  { id: 'two_factor', prompt: 'Explain two-factor authentication in two short sentences.' },
  { id: 'api', prompt: 'What is an API? Explain in two short sentences for a non-programmer.' },
  { id: 'weather', prompt: 'What is the weather in Kaunas today? Celsius, a short answer with its source.' },
]);

export function schedule(seed, repetitions = 2) {
  if (!/^[a-zA-Z0-9_-]{1,80}$/.test(seed) || ![1, 2, 3].includes(repetitions)) throw Error('INVALID_PLAN');
  const rows = CASES.flatMap(test => Array.from({ length: repetitions }, (_, repetition) =>
    ['on', 'off'].map(arm => ({ ...test, repetition, arm, key: `${test.id}_${repetition}_${arm}` })))).flat();
  return rows.sort((a, b) => createHash('sha256').update(`${seed}:${a.key}`).digest('hex')
    .localeCompare(createHash('sha256').update(`${seed}:${b.key}`).digest('hex')));
}

export function parseOptions(args) {
  const options = { live: false, seed: randomBytes(12).toString('hex'), repetitions: 2 };
  const seen = new Set();
  for (let i = 0; i < args.length; i++) {
    const key = args[i];
    if (seen.has(key)) throw Error('DUPLICATE_OPTION'); seen.add(key);
    if (key === '--live') { options.live = true; continue; }
    if (!['--desktop', '--cdp', '--db', '--seed', '--repetitions'].includes(key) || !args[i + 1]) throw Error('INVALID_OPTION');
    options[key.slice(2)] = args[++i];
  }
  options.repetitions = Number(options.repetitions);
  schedule(options.seed, options.repetitions);
  if (options.live && (!isAbsolute(options.desktop || '') || !isAbsolute(options.db || '') || !/^http:\/\/127\.0\.0\.1:\d+$/.test(options.cdp || '')))
    throw Error('LIVE_REQUIRES_DESKTOP_DB_AND_LOOPBACK_CDP');
  return options;
}

export function readMount(db, url, run = spawnSync) {
  const id = new URLSearchParams(url.split('?')[1]).get('resumeSessionId');
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id || '')) throw Error('SESSION_ID_UNAVAILABLE');
  const query = `SELECT json_extract(j.value, '$.name') AS name FROM sessions s,
    json_each(s.extension_data, '$."enabled_extensions.v0".extensions') j WHERE s.id='${id}';`;
  const result = run('sqlite3', ['-readonly', '-json', db, query], { encoding: 'utf8', timeout: 10000 });
  if (result.error || result.status !== 0) throw Error('MOUNT_READ_FAILED');
  const names = JSON.parse(result.stdout || '[]').map(row => row.name);
  if (!names.length) throw Error('MOUNT_STATE_UNAVAILABLE');
  return { sessionId: id, axwiseMounted: names.includes('axwise-local'), extensionNames: names };
}

async function setCapability(page, checked) {
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('tab', { name: 'Chat', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Local Axwise specialist', exact: true });
  // The loading switch defaults to false; never treat that as persisted OFF.
  await page.waitForFunction(() => {
    const element = document.getElementById('axwise-local-capability');
    return element && !element.disabled;
  });
  const previous = await toggle.getAttribute('aria-checked') === 'true';
  if (checked !== undefined && checked !== previous) {
    await toggle.click();
    const element = await toggle.elementHandle();
    try { await page.waitForFunction(({ element, checked }) => element && !element.disabled && element.getAttribute('aria-checked') === String(checked), { element, checked }); }
    finally { await element?.dispose(); }
  }
  const expected = checked ?? previous;
  await page.waitForFunction(async expected => {
    const result = await window.electron.getSetting('axwiseLocalEnabled');
    return result === expected;
  }, expected);
  return previous;
}

export async function main(args) {
  const options = parseOptions(args), plan = schedule(options.seed, options.repetitions);
  if (!options.live) { console.log(JSON.stringify({ live: false, seed: options.seed, plan }, null, 2)); return; }
  const require = createRequire(join(options.desktop, 'package.json'));
  const { chromium } = require('playwright-core');
  const browser = await chromium.connectOverCDP(options.cdp);
  const page = browser.contexts().flatMap(context => context.pages()).find(tab => /^http:\/\/localhost:\d+/.test(tab.url()));
  if (!page) throw Error('ELECTRON_RENDERER_NOT_FOUND');
  page.setDefaultTimeout(15000);
  const output = await mkdtemp(join(tmpdir(), 'axwise-desktop-randomized-'));
  const report = { kind: 'real-electron-randomized-axwise-on-off', seed: options.seed, plan, rows: [],
    startedAt: new Date().toISOString(), limitations: ['Small exploratory sample; not vanilla Goose.',
      'Provider and response cache states are observed, not forced cold/warm.',
      'Navigation, settings changes and typing excluded; Send through completion included.'], error: null };
  const save = () => writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2), { mode: 0o600 });
  let initial;
  try {
    initial = await setCapability(page);
    await save(); console.log(JSON.stringify({ output, seed: options.seed, planned: plan.length }));
    for (const test of plan) {
      await setCapability(page, test.arm === 'on');
      await page.getByRole('button', { name: 'New Chat', exact: true }).click();
      await page.waitForTimeout(750);
      await page.locator('[data-testid="chat-input"]:visible').fill(test.prompt);
      const send = page.getByRole('button', { name: 'Send', exact: true });
      await send.waitFor({ state: 'visible' });
      await page.evaluate(() => {
        window.__routingObserver?.disconnect();
        const turn = { startedAt: Date.now(), sawBusy: false, completedAt: null, approvalAt: null };
        window.__routingTurn = turn;
        const update = () => {
          const busy = [...document.querySelectorAll('button[aria-label="Stop"]')].some(button => button.getClientRects().length);
          const approval = [...document.querySelectorAll('button')].some(button => button.getClientRects().length && !button.disabled && /^Allow Once$/i.test(button.textContent.trim()));
          if (busy) turn.sawBusy = true;
          if (approval) turn.approvalAt ??= Date.now();
          if (turn.sawBusy && !busy && !approval) turn.completedAt ??= Date.now();
        };
        window.__routingObserver = new MutationObserver(update);
        window.__routingObserver.observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true });
      });
      await send.click();
      let error = null;
      try { await page.waitForFunction(() => window.__routingTurn?.completedAt || window.__routingTurn?.approvalAt, {}, { timeout: 60000 }); }
      catch { error = 'TURN_TIMEOUT'; }
      const observed = await page.evaluate(() => ({ ...window.__routingTurn, visible: document.body.innerText, url: location.href }));
      const mount = readMount(options.db, observed.url);
      const row = { ...test, ...observed, elapsedMs: observed.completedAt ? observed.completedAt - observed.startedAt : null,
        ...mount, status: error || (observed.approvalAt ? 'APPROVAL_REQUIRED'
          : mount.axwiseMounted !== (test.arm === 'on') ? 'MOUNT_MISMATCH' : 'completed') };
      report.rows.push(row); await save();
      console.log(JSON.stringify({ key: row.key, status: row.status, elapsedMs: row.elapsedMs, url: row.url }));
      if (row.status !== 'completed') throw Error(row.status);
      if (test.id === 'weather') await page.screenshot({ path: join(output, `${test.key}.png`) });
    }
  } catch (error) {
    report.error = /^[A-Z_]+$/.test(error.message) ? error.message : 'DESKTOP_BENCHMARK_FAILED';
    await save(); throw error;
  } finally {
    if (initial !== undefined && !report.rows.some(row => row.status === 'APPROVAL_REQUIRED' || row.status === 'TURN_TIMEOUT')) {
      try { await setCapability(page, initial); report.capabilityRestored = true; } catch { report.capabilityRestored = false; }
    }
    await save(); await browser.close();
  }
  console.log(JSON.stringify({ completed: report.rows.length, report: join(output, 'report.json') }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href)
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
