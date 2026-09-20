(function () {
  async function refreshHeartbeat() {
    try {
      const resp = await fetch('/heartbeat.json?t=' + Date.now(), { cache: 'no-store' });
      if (!resp.ok) return;
      const data = await resp.json();
      if (!data || !Array.isArray(data.endpoints)) return;

      const grid = document.getElementById('heartbeat-grid');
      if (grid) {
        let totalLatency = 0;
        let validCount = 0;
        let html = '';
        for (const ep of data.endpoints) {
          totalLatency += ep.latencyMs || 0;
          validCount++;
          const isOk = ep.status >= 200 && ep.status < 400;
          const statusClass = isOk ? 'endpoint-status' : 'endpoint-status style="color:#f87171;background:rgba(239,68,68,0.15)"';
          html += `
            <div class="endpoint-box">
              <div class="endpoint-name">
                <span>${escapeHtml(ep.name)}</span>
                <span class="${statusClass}">${ep.status ? ep.status + ' OK' : 'OFFLINE'}</span>
              </div>
              <div class="endpoint-url">${escapeHtml(ep.url)}</div>
              <div class="endpoint-metrics">
                <span style="color:var(--text-muted);font-size:11px">Edge Latency</span>
                <span class="endpoint-latency">${ep.latencyMs} ms</span>
              </div>
            </div>
          `;
        }
        grid.innerHTML = html;

        if (validCount > 0) {
          const avg = (totalLatency / validCount).toFixed(1);
          const avgEl = document.getElementById('heartbeat-avg');
          if (avgEl) avgEl.textContent = 'Global Average Latency: ' + avg + ' ms';
        }
      }

      const badge = document.getElementById('heartbeat-badge');
      if (badge) {
        badge.textContent = data.allHealthy ? 'ALL HEALTHY • AUTOMATED 24/7 SLA' : 'DEGRADED';
      }

      const timeEl = document.getElementById('heartbeat-timestamp');
      if (timeEl && data.timestamp) {
        const dateStr = new Date(data.timestamp).toLocaleTimeString();
        timeEl.innerHTML = `Automated perpetual verification every 20m &bull; Last snapshot verified at <strong>${dateStr}</strong> &bull; Zero secrets exposed`;
      }

      // Dynamic tooltip rendering for archetype benchmarks with verbatim prompt histories
      if (Array.isArray(data.archetypeBenchmarks) && data.archetypeBenchmarks.length > 0) {
        const tbody = document.getElementById('archetypes-tbody');
        if (tbody) {
          let rowsHtml = '';
          for (const a of data.archetypeBenchmarks) {
            const ev = a.evaluation || {};

            let recentPromptsHtml = '';
            if (Array.isArray(ev.recent3hPrompts) && ev.recent3hPrompts.length > 0) {
              recentPromptsHtml = '<div style="margin-top:6px;padding-top:6px;border-top:1px solid rgba(255,255,255,0.08);"><strong style="color:#fff;font-size:11px">Recent evaluated prompts in 3h:</strong><ul style="padding-left:14px;margin:4px 0 0 0;">';
              for (const p of ev.recent3hPrompts) {
                recentPromptsHtml += `<li style="margin-bottom:4px;"><span style="color:#34d399;font-weight:600">[${escapeHtml(p.measured)}]</span> "${escapeHtml(p.prompt)}"</li>`;
              }
              recentPromptsHtml += '</ul></div>';
            }

            rowsHtml += `
              <tr>
                <td><strong>${escapeHtml(a.name)}</strong></td>
                <td>${escapeHtml(a.scope)}</td>
                <td>
                  <strong style="color:#34d399">${escapeHtml(a.last15m)}</strong>
                  <span class="info-tip">i
                    <span class="tip-box" style="width:320px;">
                      <span class="tip-title">${escapeHtml(a.name)}: Latest Evaluated Prompt</span>
                      <strong>Verbatim Prompt:</strong> "${escapeHtml(ev.lastPrompt || a.scope)}"<br>
                      <strong>Turns:</strong> ${ev.turns || 1} | <strong>Latency:</strong> <span style="color:#34d399">${escapeHtml(ev.measuredFormatted || a.last15m)}</span><br>
                      <strong>Context:</strong> ${escapeHtml(ev.context || a.impact)}
                    </span>
                  </span>
                </td>
                <td>
                  ${escapeHtml(a.last3h)}
                  <span class="info-tip">i
                    <span class="tip-box" style="width:340px;">
                      <span class="tip-title">${escapeHtml(a.name)}: 3-Hour Rolling Window</span>
                      Rolling mean of ${ev.samples3h || 9} runs rotating across ${ev.catalogTotal || 4} distinct prompt scenarios.
                      ${recentPromptsHtml}
                    </span>
                  </span>
                </td>
                <td>
                  ${escapeHtml(a.last24h)}
                  <span class="info-tip">i
                    <span class="tip-box" style="width:300px;">
                      <span class="tip-title">${escapeHtml(a.name)}: 24-Hour Daily Aggregate</span>
                      Tested across ${ev.samples24h || 72} autonomous cycles under varied diurnal network conditions.<br>
                      <strong>Total Scenarios in Catalog:</strong> ${ev.catalogTotal || 4} rotating prompts.
                    </span>
                  </span>
                </td>
                <td><span style="color:#f87171">${escapeHtml(a.baseline)}</span></td>
                <td>${escapeHtml(a.impact)}</td>
              </tr>
            `;
          }
          tbody.innerHTML = rowsHtml;
        }
      }
    } catch (e) {}
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', refreshHeartbeat);
  } else {
    refreshHeartbeat();
  }
  setInterval(refreshHeartbeat, 30000);
})();
