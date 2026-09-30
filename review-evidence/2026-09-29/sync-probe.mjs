import assert from 'node:assert/strict';
import { readFileSync, writeFileSync, mkdtempSync, rmSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { stripTypeScriptTypes } from 'node:module';
import { execFileSync } from 'node:child_process';
const repo = process.argv[2] || '/Users/admin/axwise-opensource/orqaly-goose';
const source = file => readFileSync(join(repo, 'ui/desktop/src', file), 'utf8');
const toUrl = code => 'data:text/javascript;base64,' + Buffer.from(code).toString('base64');
const clockUrl = toUrl(stripTypeScriptTypes(source('orqaly/sync/vectorClock.ts')));
const ledgerUrl = toUrl(stripTypeScriptTypes(source('orqaly/sync/eventLedger.ts')).replace("'./vectorClock'", JSON.stringify(clockUrl)));
const managerUrl = toUrl(stripTypeScriptTypes(source('orqaly/sync/syncManager.ts')).replace("'./eventLedger'", JSON.stringify(ledgerUrl)));
const { EventLedger, computeEventHash } = await import(ledgerUrl);
const { SyncManager } = await import(managerUrl);
const results = { head: execFileSync('git', ['rev-parse', 'HEAD'], { cwd: repo, encoding: 'utf8' }).trim(), limitations: 'Offline source-level probes; Electron IPC mocked; UI handler executed without rendering; no live cloud or mobile validation.', checks: [] };
const record = (name, result) => results.checks.push({ name, ...result });
const dir = mkdtempSync(join(tmpdir(), 'review-sync-'));
try {
  let requests = 0;
  globalThis.fetch = async () => { requests++; throw Error('offline'); };
  const manager = new SyncManager(dir);
  manager.appendEvent('session', 'message_append', { text: 'example' });
  const offline = await manager.syncAll('https://unreachable.invalid', 'invalid-token');
  assert.equal(offline.success, true);
  assert.equal(requests, 0);
  record('syncAll succeeds without transport', { result: offline, fetchRequests: requests });

  const registrations = new Map();
  const main = source('main.ts');
  const registration = main.slice(main.indexOf("ipcMain.handle('sync:trigger'"), main.indexOf("ipcMain.handle('sync:getStatus'"));
  assert.match(registration, /getSyncManager\(\)\.syncAll\(\)/);
  new Function('ipcMain', 'getSyncManager', registration)({ handle: (name, handler) => registrations.set(name, handler) }, () => manager);
  const preloadTriggerLine = source('preload.ts').split('\n').find(line => /trigger:.*ipcRenderer\.invoke\('sync:trigger'\)/.test(line));
  assert.ok(preloadTriggerLine);
  const invokedChannels = [];
  const bridge = new Function('ipcRenderer', `return ({ ${preloadTriggerLine} });`)({ invoke: async channel => { invokedChannels.push(channel); return registrations.get(channel)(); } });
  const ui = source('components/settings/auth/AuthSettingsSection.tsx');
  const handlerSource = ui.slice(ui.indexOf('  const handleSyncNow = async () => {'), ui.indexOf('  const loadSecrets = useCallback'));
  assert.match(ui, /onClick=\{handleSyncNow\}/);
  assert.match(source('components/settings/SettingsView.tsx'), /<AuthSettingsSection\s*\/>/);
  const toasts = [];
  const handleSyncNow = new Function('window', 'toast', 'setSyncing', `${handlerSource}\nreturn handleSyncNow;`)({ electron: { sync: bridge } }, { success: msg => toasts.push({ kind: 'success', msg }), error: msg => toasts.push({ kind: 'error', msg }) }, () => {});
  await handleSyncNow();
  assert.deepEqual(invokedChannels, ['sync:trigger']);
  assert.match(toasts[0].msg, /Synced 1 session ledgers with Orqanix Cloud/);
  assert.equal(requests, 0);
  record('Actual settings handler → source preload trigger → source main handler → manager', { invokedChannels, toasts, fetchRequests: requests });

  const restarted = new SyncManager(dir);
  const reopened = await restarted.syncAll();
  const persistedSnapshot = existsSync(join(dir, 'event_ledgers/session.json'));
  assert.equal(persistedSnapshot, true);
  assert.equal(reopened.syncedSessions, 0);
  record('Restarted manager ignores unopened saved ledger', { persistedSnapshot, result: reopened });

  rmSync(join(dir, 'event_ledgers'), { recursive: true });
  const logErrors = [];
  const oldError = console.error;
  let returned, failedStorageResult;
  try {
    console.error = (...args) => logErrors.push(String(args[0]));
    returned = manager.appendEvent('session', 'message_append', { text: 'not durable' });
    failedStorageResult = await manager.syncAll();
  } finally { console.error = oldError; }
  assert.ok(returned);
  assert.equal(failedStorageResult.success, true);
  assert.equal(existsSync(join(dir, 'event_ledgers/session.json')), false);
  record('Failed storage still acknowledges append and sync', { appendReturned: Boolean(returned), result: failedStorageResult, persistedSnapshot: false, loggedErrors: logErrors.length });
} finally { rmSync(dir, { recursive: true, force: true }); }

const origin = new EventLedger('s', 'desktop');
const parent = origin.append('session_init', { title: 'root' });
const child = origin.append('message_append', { text: 'child' });
const target = new EventLedger('s', 'mobile');
const merged = target.merge([{ ...parent, payload: { title: 'corrupted' } }, child]);
assert.equal(merged.rejected.length, 1);
assert.equal(merged.added.length, 1);
assert.equal(target.getEvent(parent.id), undefined);
assert.equal(target.linearize().length, 1);
record('Rejected parent still satisfies child dependency', { added: merged.added.map(x => x.type), rejected: merged.rejected.map(x => x.reason), storedParent: false, linearized: target.linearize().map(x => x.type) });

const event = { id: 'cycle', sessionId: 's', deviceId: 'mobile', type: 'message_append', clock: { mobile: 1 }, parentIds: ['cycle'], timestamp: 1, payload: 'x' };
const cyclic = new EventLedger('s', 'desktop');
const cycleResult = cyclic.merge([{ ...event, hash: computeEventHash(event) }]);
assert.equal(cycleResult.added.length, 1);
assert.equal(cyclic.linearize().length, 0);
record('Self-cycle accepted then omitted by linearization', { added: cycleResult.added.length, rejected: cycleResult.rejected.length, stored: cyclic.getEvents().length, linearized: cyclic.linearize().length });
const serialized = JSON.stringify(results, null, 2);
writeFileSync(new URL('./sync-results.json', import.meta.url), serialized + '\n');
console.log(serialized);
