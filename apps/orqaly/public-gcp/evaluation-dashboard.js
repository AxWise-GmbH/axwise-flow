(function (root, factory) {
  const api = factory();
  if (root) root.OrqanixEvaluationDashboard = api;
  if (root && root.document) {
    root.addEventListener('DOMContentLoaded', () => {
      api.start(root.document, root.fetch.bind(root));
      root.setInterval(() => api.start(root.document, root.fetch.bind(root)), 60000);
    });
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUMMARY_SCHEMA = 'orqanix.agent-evaluation-summary.v1';
  const WINDOW_KEYS = ['15m', '3h', '24h'];
  const CATEGORY_KEYS = ['message', 'coding', 'search', 'research', 'plan'];
  const ARM_KEYS = ['orqanix', 'vanilla'];

  function isRecord(value) {
    return value !== null && typeof value === 'object' && !Array.isArray(value);
  }

  function finiteNonNegative(value) {
    return Number.isFinite(value) && value >= 0;
  }

  function validCount(value) {
    return Number.isInteger(value) && value >= 0;
  }

  function validIso(value) {
    return typeof value === 'string' && Number.isFinite(Date.parse(value));
  }

  function validOutcomeCounts(value, keys) {
    return isRecord(value) && keys.every((key) => validCount(value[key]));
  }

  function validLatency(value) {
    return isRecord(value) && validCount(value.sampleCount) &&
      (value.p50 === null || finiteNonNegative(value.p50)) &&
      (value.p95 === null || finiteNonNegative(value.p95));
  }

  function validUsage(value) {
    return value === null || (isRecord(value) && validCount(value.sampleCount) &&
      validCount(value.inputTokens) && validCount(value.outputTokens) && validCount(value.totalTokens));
  }

  function validArmUsage(value) {
    return value === null || (isRecord(value) && validCount(value.inputTokens) &&
      validCount(value.outputTokens) && validCount(value.totalTokens));
  }

  function validCategory(value) {
    if (!isRecord(value) || typeof value.label !== 'string' || !validCount(value.sampleCount)) return false;
    if (!isRecord(value.execution) || !isRecord(value.evaluation) || !isRecord(value.latencyMs) ||
        !isRecord(value.usage) || !isRecord(value.comparison)) return false;
    return ARM_KEYS.every((arm) =>
      validOutcomeCounts(value.execution[arm], ['completed', 'failed', 'notEvaluated']) &&
      validOutcomeCounts(value.evaluation[arm], ['passed', 'failed', 'notEvaluated']) &&
      validLatency(value.latencyMs[arm]) && validUsage(value.usage[arm])) &&
      validCount(value.comparison.pairedSuccessfulCount) &&
      (value.comparison.orqanixToVanillaLatencyRatioP50 === null ||
        finiteNonNegative(value.comparison.orqanixToVanillaLatencyRatioP50));
  }

  function validLatestArm(value) {
    if (!isRecord(value) || !['completed', 'failed', 'not_evaluated'].includes(value.status)) return false;
    if (typeof value.endpoint !== 'string' || value.endpoint.length === 0) return false;
    if (typeof value.model !== 'string' || value.model.length === 0) return false;
    if (!(value.resolvedModel === undefined || value.resolvedModel === null || typeof value.resolvedModel === 'string')) return false;
    if (!finiteNonNegative(value.elapsedMs)) return false;
    if (!['passed', 'failed', 'not_evaluated'].includes(value.evaluationVerdict)) return false;
    if (!(value.evidenceId === null || typeof value.evidenceId === 'string')) return false;
    if (!(value.outputHash === null || (typeof value.outputHash === 'string' && /^[a-f0-9]{64}$/i.test(value.outputHash)))) return false;
    return validArmUsage(value.usage === undefined ? null : value.usage);
  }

  function validLatest(value) {
    if (value === null) return true;
    if (!isRecord(value) || typeof value.runId !== 'string' || !validIso(value.finishedAt) || !Array.isArray(value.cases) || value.cases.length !== CATEGORY_KEYS.length) return false;
    if (!CATEGORY_KEYS.every((category) => value.cases.filter((item) => item?.category === category).length === 1)) return false;
    return value.cases.every((item) => isRecord(item) && CATEGORY_KEYS.includes(item.category) &&
      typeof item.label === 'string' && typeof item.templateId === 'string' &&
      Number.isInteger(item.templateVersion) && item.templateVersion > 0 && typeof item.seed === 'string' &&
      typeof item.inputHash === 'string' && typeof item.prompt === 'string' &&
      Array.isArray(item.criteria) && item.criteria.every((criterion) => typeof criterion === 'string') &&
      isRecord(item.arms) && ARM_KEYS.every((arm) => validLatestArm(item.arms[arm])));
  }

  function validateSummary(value) {
    if (!isRecord(value) || value.schemaVersion !== SUMMARY_SCHEMA || !validIso(value.generatedAt)) return false;
    if (!isRecord(value.freshness) || !['fresh', 'stale', 'unavailable'].includes(value.freshness.status) ||
        !(value.freshness.latestFinishedAt === null || validIso(value.freshness.latestFinishedAt)) ||
        !(value.freshness.ageSeconds === null || finiteNonNegative(value.freshness.ageSeconds)) ||
        !finiteNonNegative(value.freshness.staleAfterSeconds)) return false;
    if (!isRecord(value.windows) || !WINDOW_KEYS.every((key) => {
      const window = value.windows[key];
      return isRecord(window) && finiteNonNegative(window.durationSeconds) && validIso(window.since) && validIso(window.until) &&
        validCount(window.runCount) && validCount(window.caseCount) && isRecord(window.categories) &&
        CATEGORY_KEYS.every((category) => validCategory(window.categories[category]));
    })) return false;
    return validLatest(value.latest);
  }

  function formatDuration(value) {
    if (!finiteNonNegative(value)) return '—';
    if (value < 1000) return `${Math.round(value)} ms`;
    if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 2 : 1)} s`;
    return `${(value / 60000).toFixed(1)} min`;
  }

  function formatInteger(value) {
    return validCount(value) ? new Intl.NumberFormat('en-US').format(value) : '—';
  }

  function formatRatio(value) {
    return finiteNonNegative(value) ? `${value.toFixed(2)}×` : 'Not comparable';
  }

  function el(document, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function replaceChildren(node, children) {
    if (node) node.replaceChildren(...children);
  }

  function stateBadge(document, label, state) {
    const badge = el(document, 'span', 'state-badge', label);
    badge.dataset.state = state;
    return badge;
  }

  function outcomeText(counts, quality) {
    if (!counts) return 'Unavailable';
    if (quality) return `${counts.passed} passed · ${counts.failed} failed · ${counts.notEvaluated} not evaluated`;
    return `${counts.completed} completed · ${counts.failed} failed · ${counts.notEvaluated} not evaluated`;
  }

  function usageText(usage) {
    if (!usage) return 'Not reported';
    const samples = validCount(usage.sampleCount) ? ` · ${usage.sampleCount} samples` : '';
    return `${formatInteger(usage.totalTokens)} total (${formatInteger(usage.inputTokens)} in / ${formatInteger(usage.outputTokens)} out)${samples}`;
  }

  function deriveFreshness(summary, nowMs) {
    const generatedAt = Date.parse(summary.generatedAt);
    const latestFinishedAt = summary.freshness.latestFinishedAt === null ? null : Date.parse(summary.freshness.latestFinishedAt);
    if (generatedAt > nowMs + 60000 || (latestFinishedAt !== null && latestFinishedAt > nowMs + 60000)) return null;
    if (latestFinishedAt === null) return { status: 'unavailable', ageSeconds: null };
    const ageSeconds = Math.max(0, (nowMs - latestFinishedAt) / 1000);
    return { status: ageSeconds > summary.freshness.staleAfterSeconds ? 'stale' : 'fresh', ageSeconds };
  }

  function setFreshness(document, summary, measuredFreshness) {
    const target = document.getElementById('evaluation-freshness');
    if (!target) return;
    const freshness = measuredFreshness;
    let label = 'NO COMPLETED RUNS';
    let state = 'unavailable';
    if (freshness.status === 'fresh') {
      label = 'FRESH MEASUREMENTS';
      state = 'healthy';
    } else if (freshness.status === 'stale') {
      label = 'STALE MEASUREMENTS';
      state = 'stale';
    }
    target.textContent = label;
    target.dataset.state = state;
    const observed = document.getElementById('evaluation-observed');
    if (observed) observed.textContent = summary.freshness.latestFinishedAt
      ? `Latest completed run ${new Date(summary.freshness.latestFinishedAt).toISOString()} · generated ${new Date(summary.generatedAt).toISOString()} · stale after ${Math.round(summary.freshness.staleAfterSeconds / 60)} minutes`
      : `No completed evaluation run is available · generated ${new Date(summary.generatedAt).toISOString()}`;
  }

  function renderWindowCards(document, summary) {
    const target = document.getElementById('evaluation-window-cards');
    if (!target) return;
    replaceChildren(target, WINDOW_KEYS.map((key) => {
      const window = summary.windows[key];
      const card = el(document, 'button', 'window-card');
      card.type = 'button';
      card.dataset.window = key;
      card.setAttribute('aria-pressed', key === '3h' ? 'true' : 'false');
      card.append(el(document, 'span', 'window-label', key === '15m' ? 'Last 15 minutes' : `Last ${key}`));
      card.append(el(document, 'strong', 'window-value', `${window.runCount} runs · ${window.caseCount} cases`));
      card.append(el(document, 'span', 'window-range', `${new Date(window.since).toISOString()} → ${new Date(window.until).toISOString()}`));
      return card;
    }));
  }

  function metric(document, label, value, note) {
    const card = el(document, 'div', 'metric-card');
    card.append(el(document, 'div', 'metric-label', label));
    card.append(el(document, 'div', 'metric-value', value));
    if (note) card.append(el(document, 'div', 'metric-note', note));
    return card;
  }

  function renderOverview(document, window) {
    const target = document.getElementById('evaluation-overview');
    if (!target) return;
    let completed = 0;
    let passed = 0;
    let failed = 0;
    let paired = 0;
    CATEGORY_KEYS.forEach((key) => {
      const category = window.categories[key];
      ARM_KEYS.forEach((arm) => {
        completed += category.execution[arm].completed;
        passed += category.evaluation[arm].passed;
        failed += category.execution[arm].failed + category.evaluation[arm].failed;
      });
      paired += category.comparison.pairedSuccessfulCount;
    });
    replaceChildren(target, [
      metric(document, 'Recorded runs', String(window.runCount), `${window.caseCount} category cases`),
      metric(document, 'Completed arm executions', String(completed), 'Both arms are counted separately'),
      metric(document, 'Quality checks passed', String(passed), 'Criteria verdicts, not self-reported confidence'),
      metric(document, 'Failures recorded', String(failed), 'Execution and evaluation failures remain visible'),
      metric(document, 'Paired successes', String(paired), 'Same-prompt pairs completed successfully'),
    ]);
  }

  function makeCell(document, text, className) {
    return el(document, 'td', className || '', text);
  }

  function renderCategoryTable(document, window) {
    const body = document.getElementById('evaluation-category-body');
    if (!body) return;
    replaceChildren(body, CATEGORY_KEYS.map((key) => {
      const category = window.categories[key];
      const row = el(document, 'tr');
      const heading = el(document, 'td', 'category-cell');
      heading.append(el(document, 'strong', '', category.label));
      heading.append(el(document, 'span', 'muted-line', `${category.sampleCount} cases`));
      row.append(heading);
      ARM_KEYS.forEach((arm) => {
        const cell = el(document, 'td', 'arm-cell');
        cell.append(el(document, 'strong', '', arm === 'orqanix' ? 'Orqanix' : 'Vanilla'));
        cell.append(el(document, 'span', 'muted-line', outcomeText(category.execution[arm], false)));
        cell.append(el(document, 'span', 'muted-line', `Quality: ${outcomeText(category.evaluation[arm], true)}`));
        row.append(cell);
      });
      const latency = el(document, 'td');
      latency.append(el(document, 'span', '', `Orqanix ${formatDuration(category.latencyMs.orqanix.p50)} p50 / ${formatDuration(category.latencyMs.orqanix.p95)} p95`));
      latency.append(el(document, 'span', 'muted-line', `Vanilla ${formatDuration(category.latencyMs.vanilla.p50)} p50 / ${formatDuration(category.latencyMs.vanilla.p95)} p95`));
      row.append(latency);
      const usage = el(document, 'td');
      usage.append(el(document, 'span', '', `Orqanix: ${usageText(category.usage.orqanix)}`));
      usage.append(el(document, 'span', 'muted-line', `Vanilla: ${usageText(category.usage.vanilla)}`));
      row.append(usage);
      const comparison = el(document, 'td');
      comparison.append(el(document, 'strong', '', formatRatio(category.comparison.orqanixToVanillaLatencyRatioP50)));
      comparison.append(el(document, 'span', 'muted-line', `${category.comparison.pairedSuccessfulCount} paired successes`));
      row.append(comparison);
      return row;
    }));
  }

  function renderWindow(document, summary, key) {
    const window = summary.windows[key];
    renderOverview(document, window);
    renderCategoryTable(document, window);
    document.querySelectorAll('[data-window]').forEach((button) => button.setAttribute('aria-pressed', String(button.dataset.window === key)));
    const title = document.getElementById('evaluation-window-title');
    if (title) title.textContent = `${key === '15m' ? '15-minute' : key} measured window`;
  }

  function safeEvidenceHref(value, category, armName) {
    if (typeof value !== 'string') return null;
    const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedArm = armName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^/heartbeat/evidence/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.json#${escapedCategory}-${escapedArm}$`, 'i');
    return pattern.test(value) ? value : null;
  }

  function armDetails(document, name, arm, category, armName) {
    const pane = el(document, 'div', 'arm-detail');
    const title = el(document, 'div', 'arm-heading');
    title.append(el(document, 'strong', '', name));
    const state = arm.status === 'completed' && arm.evaluationVerdict === 'passed' ? 'healthy' :
      arm.status === 'failed' || arm.evaluationVerdict === 'failed' ? 'degraded' : 'stale';
    title.append(stateBadge(document, `${arm.status.replace('_', ' ')} · ${arm.evaluationVerdict.replace('_', ' ')}`, state));
    pane.append(title);
    const model = arm.resolvedModel || arm.model || 'Model not reported';
    pane.append(el(document, 'div', 'detail-line', `${model} · ${arm.endpoint || 'Endpoint not reported'}`));
    pane.append(el(document, 'div', 'detail-line', `Elapsed: ${formatDuration(arm.elapsedMs)} · Usage: ${usageText(arm.usage || null)}`));
    if (arm.evaluationReason) pane.append(el(document, 'div', 'detail-line failure-copy', arm.evaluationReason));
    const evidence = el(document, 'div', 'evidence-line');
    evidence.append(document.createTextNode('Evidence ID: '));
    const evidenceHref = safeEvidenceHref(arm.evidenceId, category, armName);
    if (evidenceHref) {
      const link = el(document, 'a', 'evidence-link', arm.evidenceId);
      link.href = evidenceHref;
      evidence.append(link);
    } else {
      evidence.append(document.createTextNode(arm.evidenceId || 'not published'));
    }
    evidence.append(document.createTextNode(` · Output hash: ${arm.outputHash || 'not available'}`));
    pane.append(evidence);
    return pane;
  }

  function renderLatest(document, latest) {
    const target = document.getElementById('evaluation-latest');
    if (!target) return;
    if (!latest) {
      replaceChildren(target, [el(document, 'div', 'empty-state', 'No completed evaluation run has been recorded yet.')]);
      return;
    }
    const header = document.getElementById('latest-run-meta');
    if (header) header.textContent = `Run ${latest.runId} · slot ${latest.slot} · finished ${new Date(latest.finishedAt).toISOString()}`;
    replaceChildren(target, latest.cases.map((item) => {
      const card = el(document, 'article', 'prompt-card');
      const head = el(document, 'div', 'prompt-head');
      head.append(el(document, 'h3', '', item.label));
      head.append(el(document, 'span', 'template-tag', `${item.templateId} · v${item.templateVersion} · seed ${item.seed}`));
      card.append(head);
      card.append(el(document, 'div', 'hash-line', `Input hash: ${item.inputHash}`));
      const promptTitle = el(document, 'h4', '', 'Exact prompt');
      card.append(promptTitle, el(document, 'pre', 'prompt-text', item.prompt));
      card.append(el(document, 'h4', '', 'Evaluation criteria'));
      const criteria = el(document, 'ul', 'criteria-list');
      item.criteria.forEach((criterion) => criteria.append(el(document, 'li', '', criterion)));
      card.append(criteria);
      const arms = el(document, 'div', 'arms-grid');
      arms.append(
        armDetails(document, 'Orqanix', item.arms.orqanix, item.category, 'orqanix'),
        armDetails(document, 'Vanilla', item.arms.vanilla, item.category, 'vanilla'),
      );
      card.append(arms);
      return card;
    }));
  }

  function renderHeartbeatSummary(document, summary) {
    const target = document.getElementById('evaluation-heartbeat-grid');
    if (!target) return;
    const window = summary.windows['3h'];
    replaceChildren(target, CATEGORY_KEYS.map((key) => {
      const category = window.categories[key];
      const failures = ARM_KEYS.reduce((sum, arm) => sum + category.execution[arm].failed + category.evaluation[arm].failed, 0);
      const card = el(document, 'div', 'endpoint-box');
      const head = el(document, 'div', 'endpoint-name');
      head.append(el(document, 'span', '', category.label));
      head.append(stateBadge(document, failures > 0 ? `${failures} failures` : category.sampleCount ? 'recorded' : 'no samples', failures > 0 ? 'degraded' : category.sampleCount ? 'healthy' : 'unavailable'));
      card.append(head);
      card.append(el(document, 'div', 'endpoint-url', `${category.sampleCount} cases in the 3-hour window`));
      card.append(el(document, 'div', 'endpoint-metrics', `Orqanix: ${outcomeText(category.evaluation.orqanix, true)}`));
      card.append(el(document, 'div', 'endpoint-metrics', `Vanilla: ${outcomeText(category.evaluation.vanilla, true)}`));
      return card;
    }));
  }

  function unavailable(document, reason) {
    const freshness = document.getElementById('evaluation-freshness');
    if (freshness) {
      freshness.textContent = 'MEASUREMENTS UNAVAILABLE';
      freshness.dataset.state = 'unavailable';
    }
    const observed = document.getElementById('evaluation-observed');
    if (observed) observed.textContent = reason || 'No valid evaluation summary is available. No performance or quality conclusion can be drawn.';
    ['evaluation-window-cards', 'evaluation-overview', 'evaluation-latest', 'evaluation-heartbeat-grid'].forEach((id) => {
      const target = document.getElementById(id);
      if (target) replaceChildren(target, [el(document, 'div', 'empty-state', 'No valid measured data is available.')]);
    });
    const body = document.getElementById('evaluation-category-body');
    if (body) {
      const row = el(document, 'tr');
      const cell = makeCell(document, 'No valid measured data is available.', 'empty-cell');
      cell.colSpan = 6;
      row.append(cell);
      replaceChildren(body, [row]);
    }
  }

  function render(document, summary) {
    if (!validateSummary(summary)) {
      unavailable(document, 'The published evaluation summary failed schema validation. No performance or quality conclusion can be drawn.');
      return false;
    }
    const measuredFreshness = deriveFreshness(summary, Date.now());
    if (measuredFreshness === null) {
      unavailable(document, 'The evaluation summary contains a future timestamp. No performance or quality conclusion can be drawn.');
      return false;
    }
    setFreshness(document, summary, measuredFreshness);
    renderWindowCards(document, summary);
    renderWindow(document, summary, '3h');
    renderLatest(document, summary.latest);
    renderHeartbeatSummary(document, summary);
    document.querySelectorAll('[data-window]').forEach((button) => button.addEventListener('click', () => renderWindow(document, summary, button.dataset.window)));
    return true;
  }

  async function load(fetchFn) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8000);
    try {
      const response = await fetchFn(`/heartbeat/evaluations.json?t=${Date.now()}`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error(`Evaluation summary HTTP ${response.status}`);
      return await response.json();
    } finally {
      clearTimeout(timeout);
    }
  }

  async function start(document, fetchFn) {
    if (!document.getElementById('evaluation-freshness')) return;
    try {
      render(document, await load(fetchFn));
    } catch {
      unavailable(document);
    }
  }

  return { CATEGORY_KEYS, SUMMARY_SCHEMA, WINDOW_KEYS, deriveFreshness, formatDuration, formatRatio, load, render, safeEvidenceHref, start, validateSummary };
});
