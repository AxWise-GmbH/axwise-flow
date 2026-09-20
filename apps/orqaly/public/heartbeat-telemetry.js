(function () {
  const MAX_AGE_MS = 30 * 60 * 1000;
  const elements = {
    grid: document.getElementById('heartbeat-grid'),
    badge: document.getElementById('heartbeat-badge'),
    timestamp: document.getElementById('heartbeat-timestamp'),
    average: document.getElementById('heartbeat-avg'),
  };

  function setState(state, label) {
    if (elements.badge) {
      elements.badge.textContent = label;
      elements.badge.dataset.state = state;
    }
  }

  function unavailable() {
    setState('unavailable', 'SNAPSHOT UNAVAILABLE');
    if (elements.grid) elements.grid.textContent = 'No valid endpoint observations are available.';
    if (elements.timestamp) elements.timestamp.textContent = 'Observation time unavailable. Current service health is unknown.';
    if (elements.average) elements.average.textContent = '';
  }

  function escapeHtml(value) {
    return String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  async function refreshHeartbeat() {
    try {
      const response = await fetch('/heartbeat.json?t=' + Date.now(), { cache: 'no-store', signal: AbortSignal.timeout(8000) });
      if (!response.ok) throw new Error('Snapshot unavailable');
      const data = await response.json();
      const observedAt = Date.parse(data?.timestamp);
      const ageMs = Date.now() - observedAt;
      if (data?.schemaVersion !== 'orqanix.heartbeat-snapshot.v6' ||
          data.kind !== 'endpoint-health-snapshot' || !Number.isFinite(observedAt) || ageMs < -60000 ||
          !Array.isArray(data.endpoints) || !data.endpoints.length ||
          data.endpoints.length !== data.expectedEndpointCount ||
          data.endpoints.some((endpoint) => !endpoint ||
            typeof endpoint.name !== 'string' || typeof endpoint.url !== 'string' ||
            typeof endpoint.ok !== 'boolean' || !Number.isInteger(endpoint.status) ||
            !Number.isFinite(endpoint.latencyMs) || endpoint.latencyMs < 0 ||
            !Number.isFinite(Date.parse(endpoint.timestamp)))) {
        throw new Error('Invalid snapshot');
      }
      const stale = ageMs > MAX_AGE_MS || data.endpoints.some((endpoint) =>
        Date.now() - Date.parse(endpoint.timestamp) > MAX_AGE_MS ||
        Date.parse(endpoint.timestamp) > observedAt + 60000);
      const isHealthy = (endpoint) => endpoint.ok && endpoint.status >= 200 && endpoint.status < 400;
      const allHealthy = data.allHealthy === true && data.endpoints.every(isHealthy);
      setState(stale ? 'stale' : allHealthy ? 'healthy' : 'degraded',
        stale ? 'STALE SNAPSHOT · CURRENT HEALTH UNKNOWN' : allHealthy ? 'HEALTHY AT OBSERVATION' : 'DEGRADED AT OBSERVATION');
      if (elements.grid) elements.grid.innerHTML = data.endpoints.map((endpoint) => {
        const healthy = isHealthy(endpoint);
        const state = stale ? 'stale' : healthy ? 'healthy' : 'degraded';
        const result = endpoint.status ? `HTTP ${endpoint.status}${healthy ? '' : ' · FAILED'}` : 'REQUEST FAILED';
        return `<div class="endpoint-box">
          <div class="endpoint-name"><span>${escapeHtml(endpoint.name)}</span><span class="endpoint-status" data-state="${state}">${result}${stale ? ' · STALE' : ''}</span></div>
          <div class="endpoint-url">${escapeHtml(endpoint.url)}</div>
          <div class="endpoint-metrics"><span>${endpoint.status ? 'Time to headers' : 'Elapsed until failure'}</span><span class="endpoint-latency">${endpoint.latencyMs} ms</span></div>
        </div>`;
      }).join('');
      if (elements.timestamp) elements.timestamp.textContent = `Observed ${new Date(observedAt).toISOString()} · Single runner · Stale after 30 minutes`;
      // Failure durations are not successful response latency samples.
      const successful = data.endpoints.filter(isHealthy);
      if (elements.average) elements.average.textContent = successful.length
        ? `Successful responses in this snapshot: ${successful.length}/${data.endpoints.length} · Mean time to headers: ${Math.round(successful.reduce((sum, endpoint) => sum + endpoint.latencyMs, 0) / successful.length)} ms`
        : 'No successful responses in this snapshot';
    } catch (_) {
      unavailable();
    }
  }

  refreshHeartbeat();
  // Reload the deployed snapshot and re-evaluate its age; polling does not run probes.
  setInterval(refreshHeartbeat, 30000);
})();
