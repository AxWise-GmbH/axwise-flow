import { randomUUID } from 'node:crypto';
import { buildPublicSummary, normalizeAgentEvaluationRecord } from './records.mjs';

const METADATA = 'http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default';
export function createWorkloadIdentity({ fetchImpl = fetch } = {}) {
  let access;
  const identities = new Map();
  async function metadata(path) {
    const response = await fetchImpl(`${METADATA}/${path}`, {
      headers: { 'Metadata-Flavor': 'Google' }, redirect: 'error', signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) throw new Error('workload_identity_unavailable');
    return response;
  }
  return {
    async accessToken() {
      if (!access || access.expires < Date.now() + 60000) {
        const value = await (await metadata('token')).json();
        if (typeof value.access_token !== 'string' || !Number.isFinite(value.expires_in)) throw new Error('invalid_workload_identity');
        access = { token: value.access_token, expires: Date.now() + value.expires_in * 1000 };
      }
      return access.token;
    },
    async idToken(audience) {
      let value = identities.get(audience);
      if (!value || value.expires < Date.now()) {
        const token = await (await metadata(`identity?audience=${encodeURIComponent(audience)}&format=full`)).text();
        if (!/^[\w-]+\.[\w-]+\.[\w-]+$/.test(token)) throw new Error('invalid_workload_identity');
        value = { token, expires: Date.now() + 5 * 60 * 1000 };
        identities.set(audience, value);
      }
      return value.token;
    },
  };
}

export function createEvaluationStorage({ bucket, tokenProvider, fetchImpl = fetch } = {}) {
  if (!/^orqanix-agent-evaluations-preview-\d+$/.test(bucket || '')) throw new Error('invalid_evaluation_bucket');
  const base = `https://storage.googleapis.com/storage/v1/b/${bucket}/o`;
  const safeName = name => {
    if (!/^(?:claims|records|public)\/[A-Za-z0-9/_.-]+$/.test(name) || name.includes('..')) throw new Error('invalid_object_name');
    return encodeURIComponent(name);
  };
  async function request(url, options = {}) {
    return fetchImpl(url, { ...options,
      headers: { ...options.headers, Authorization: `Bearer ${await tokenProvider()}` },
      redirect: 'error', signal: AbortSignal.timeout(15000),
    });
  }
  async function read(name, metadata = false) {
    const response = await request(`${base}/${safeName(name)}${metadata ? '?fields=generation,metadata' : '?alt=media'}`);
    if (response.status === 404) { await response.body?.cancel(); return null; }
    if (!response.ok) { await response.body?.cancel(); throw new Error(`storage_read_${response.status}`); }
    return response.json();
  }
  async function write(name, value, generation = '0') {
    safeName(name);
    const boundary = `evaluation-${randomUUID()}`;
    const meta = { name, contentType: 'application/json; charset=utf-8', cacheControl: 'no-store',
      metadata: { observedAt: value.finishedAt || value.generatedAt || value.startedAt } };
    const body = `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(meta)}\r\n`
      + `--${boundary}\r\nContent-Type: ${meta.contentType}\r\n\r\n${JSON.stringify(value)}\r\n--${boundary}--\r\n`;
    const response = await request(`https://storage.googleapis.com/upload/storage/v1/b/${bucket}/o?uploadType=multipart&ifGenerationMatch=${generation}`, {
      method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body,
    });
    await response.body?.cancel();
    if (response.status === 412) return false;
    if (!response.ok) throw new Error(`storage_write_${response.status}`);
    return true;
  }
  async function recentRecords(now) {
    // Fetch yesterday too: a run can begin before midnight and finish today.
    const sinceDay = new Date(now.getTime() - 25 * 3600000).toISOString().slice(0, 10);
    const untilDay = new Date(now.getTime() + 24 * 3600000).toISOString().slice(0, 10);
    const names = [];
    let pageToken;
    do {
      const params = new URLSearchParams({ prefix: 'records/', startOffset: `records/${sinceDay}`, endOffset: `records/${untilDay}`, maxResults: '250', fields: 'items/name,nextPageToken' });
      if (pageToken) params.set('pageToken', pageToken);
      const response = await request(`${base}?${params}`);
      if (!response.ok) { await response.body?.cancel(); throw new Error(`storage_list_${response.status}`); }
      const page = await response.json();
      names.push(...(page.items || []).map(item => item.name));
      pageToken = page.nextPageToken;
      if (names.length > 500) throw new Error('evaluation_history_limit');
    } while (pageToken);
    const records = [];
    for (let offset = 0; offset < names.length; offset += 12) {
      records.push(...await Promise.all(names.slice(offset, offset + 12).map(name => read(name))));
    }
    return records.filter(Boolean);
  }
  return {
    read, write, recentRecords,
    claim(slot, runId) {
      return write(`claims/${slot.replace(/[:.]/g, '-')}.json`, { slot, runId, startedAt: new Date().toISOString() });
    },
    async publish(record, evidence, { now = new Date() } = {}) {
      const normalized = normalizeAgentEvaluationRecord(record);
      if (!/^[a-f0-9-]{36}$/.test(normalized.runId)) throw new Error('invalid_run_id');
      // Publish referenced evidence before including the run in the visible summary.
      await write(`public/evidence/${normalized.runId}.json`, evidence);
      await write(`records/${normalized.slot.slice(0, 10)}/${normalized.runId}.json`, normalized);
      for (let attempt = 0; attempt < 4; attempt++) {
        const previous = await read('public/evaluations.json', true);
        if (previous && !/^\d+$/.test(previous.generation)) throw new Error('invalid_summary_generation');
        const summary = buildPublicSummary(await recentRecords(now), { now });
        if (await write('public/evaluations.json', summary, previous?.generation || '0')) return summary;
        now = new Date();
      }
      throw new Error('evaluation_summary_conflict');
    },
  };
}
