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
    if (value.status !== 'completed' && value.evaluationVerdict === 'passed') return false;
    if (!(value.evaluationKind === undefined || ['checks', 'advisory'].includes(value.evaluationKind))) return false;
    if (!(value.originalEvaluationVerdict === undefined || ['passed', 'failed', 'not_evaluated'].includes(value.originalEvaluationVerdict))) return false;
    if (!['error', 'evaluationReason', 'evaluationNotice'].every((key) => value[key] === undefined || typeof value[key] === 'string')) return false;
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
    if (!validLatest(value.latest)) return false;
    if (value.history !== undefined && (!Array.isArray(value.history) || value.history.length > 96 ||
      !value.history.every((run) => run !== null && validLatest(run) && Date.parse(run.finishedAt) <= Date.parse(value.generatedAt)) ||
      new Set(value.history.map((run) => run.runId)).size !== value.history.length)) return false;
    return true;
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

  const viewStates = new WeakMap();

  function el(document, tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function replaceChildren(node, children) {
    if (node) node.replaceChildren(...children);
  }

  function usageText(usage) {
    return usage ? `${formatInteger(usage.totalTokens)} tokens (${formatInteger(usage.inputTokens)} in / ${formatInteger(usage.outputTokens)} out)` : 'Not captured';
  }

  function reviewLabel(arm) {
    if (arm.originalEvaluationVerdict !== undefined && arm.evaluationNotice) return { text: 'Review outdated — needs reevaluation', state: 'stale' };
    if (arm.evaluationKind === 'advisory') {
      return arm.evaluationVerdict === 'passed' ? { text: 'Jev: supported', state: 'healthy' } :
        arm.evaluationVerdict === 'failed' ? { text: 'Jev: concerns', state: 'stale' } : { text: 'Jev: not reviewed', state: 'unavailable' };
    }
    return arm.evaluationVerdict === 'passed' ? { text: 'Checks passed', state: 'healthy' } :
      arm.evaluationVerdict === 'failed' ? { text: 'Checks failed', state: 'degraded' } : { text: 'Not evaluated', state: 'unavailable' };
  }

  function outcome(arm) {
    if (arm.error === 'NATIVE_CODING_ADAPTER_UNAVAILABLE') return { text: 'Coding adapter unavailable', state: 'unavailable' };
    if (arm.status === 'failed') return { text: `Execution failed after ${formatDuration(arm.elapsedMs)}`, state: 'degraded' };
    if (arm.status !== 'completed') return { text: 'Did not run', state: 'unavailable' };
    return { text: `Completed · ${formatDuration(arm.elapsedMs)}`, state: 'completed' };
  }

  function failureReason(arm) {
    const reason = arm.error || arm.evaluationReason;
    if (reason === 'NATIVE_CODING_ADAPTER_UNAVAILABLE') return 'The cloud coding adapter is retired. Native Goose uses a separate benchmark; this arm did not run.';
    if (!reason) return arm.status === 'completed' && arm.evaluationVerdict === 'not_evaluated' ? 'Quality was not evaluated.' : '';
    if (/EVIDENCE_UNAVAILABLE/i.test(reason)) return 'No usable supporting evidence was obtained.';
    if (/SOURCE_REFERENCE_REQUIRED/i.test(reason)) return 'A required source reference was missing.';
    if (/timed?_?out|timeout|deadline/i.test(reason)) return 'The request exceeded its time limit.';
    if (/truncat|token_limit|max_tokens/i.test(reason)) return 'The response was cut off before completion.';
    if (/evaluator_unavailable/i.test(reason)) return 'The quality evaluator was unavailable.';
    return reason.replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function interpretation(item) {
    const a = item.arms.orqanix;
    const b = item.arms.vanilla;
    if (a.error === 'NATIVE_CODING_ADAPTER_UNAVAILABLE') return 'The Orqanix coding arm did not run. The direct-model result is not a paired native Goose comparison.';
    if (a.status === 'failed' && b.status === 'completed') return 'The Orqanix request failed; the direct model returned an answer.';
    if (b.status === 'failed' && a.status === 'completed') return 'Orqanix returned an answer; the direct request failed.';
    if (a.status !== 'completed' || b.status !== 'completed') return 'Both requests did not complete successfully. Review the errors below.';
    if (a.originalEvaluationVerdict !== undefined || b.originalEvaluationVerdict !== undefined) return 'Both requests completed. An earlier review needs reevaluation; it does not establish a quality result.';
    if (a.evaluationKind === 'advisory' || b.evaluationKind === 'advisory') return 'Both requests completed. Jev supplies an advisory review of the requested outcome, not a probability of success or a quality winner.';
    if (a.evaluationVerdict === 'passed' && b.evaluationVerdict === 'passed') return 'Both passed the task checks. This case does not establish a quality winner.';
    return 'Both requests completed. Inspect the task checks below to understand any differences.';
  }

  function runsForWindow(summary, key) {
    const history = summary.history || (summary.latest ? [summary.latest] : []);
    const window = summary.windows[key];
    return history.filter((run) => Date.parse(run.finishedAt) >= Date.parse(window.since) && Date.parse(run.finishedAt) <= Date.parse(window.until));
  }

  function chooseRun(summary, key, runId) {
    const runs = runsForWindow(summary, key);
    return runs.find((run) => run.runId === runId) || runs[0] || summary.latest;
  }

  function deriveFreshness(summary, nowMs) {
    const generatedAt = Date.parse(summary.generatedAt);
    const latestFinishedAt = summary.freshness.latestFinishedAt === null ? null : Date.parse(summary.freshness.latestFinishedAt);
    if (generatedAt > nowMs + 60000 || (latestFinishedAt !== null && latestFinishedAt > nowMs + 60000)) return null;
    if (latestFinishedAt === null) return { status: 'unavailable', ageSeconds: null };
    const ageSeconds = Math.max(0, (nowMs - latestFinishedAt) / 1000);
    return { status: ageSeconds > summary.freshness.staleAfterSeconds ? 'stale' : 'fresh', ageSeconds };
  }

  function setFreshness(document, summary, freshness) {
    const target = document.getElementById('evaluation-freshness');
    if (target) {
      target.textContent = freshness.status === 'fresh' ? 'Up to date' : freshness.status === 'stale' ? 'Stale — latest results shown' : 'No runs yet';
      target.dataset.state = freshness.status === 'fresh' ? 'healthy' : freshness.status;
    }
    const observed = document.getElementById('evaluation-observed');
    if (observed) observed.textContent = summary.freshness.latestFinishedAt
      ? `Latest run finished ${new Date(summary.freshness.latestFinishedAt).toLocaleString()} · runs every 15 minutes`
      : 'No evaluation run has finished yet.';
  }

  function safeEvidenceHref(value, category, armName) {
    if (typeof value !== 'string') return null;
    const escapedCategory = category.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const escapedArm = armName.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(`^/heartbeat/evidence/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\\.json#${escapedCategory}-${escapedArm}$`, 'i');
    return pattern.test(value) ? value : null;
  }

  function receipt(document, arm, category, armName) {
    const href = safeEvidenceHref(arm.evidenceId, category, armName);
    if (!href) return el(document, 'span', 'muted-line', 'Receipt not published');
    const link = el(document, 'a', '', 'Output & checks ↗');
    link.href = href;
    return link;
  }

  function armCell(document, arm) {
    const cell = el(document, 'td', 'result-cell');
    const result = outcome(arm);
    const label = el(document, 'strong', 'result-label', result.text);
    label.dataset.state = result.state;
    const review = reviewLabel(arm);
    const reviewLine = el(document, 'span', 'review-label', review.text);
    reviewLine.dataset.state = review.state;
    cell.append(label, reviewLine);
    return cell;
  }

  function renderTable(document, run) {
    const body = document.getElementById('evaluation-category-body');
    if (!body) return;
    if (!run) {
      const row = el(document, 'tr');
      const cell = el(document, 'td', 'empty-state', 'No evaluation runs are available yet.');
      cell.colSpan = 5;
      row.append(cell);
      replaceChildren(body, [row]);
      return;
    }
    const expanded = new Set(Array.from(body.querySelectorAll('[aria-expanded="true"]')).map((node) => node.dataset.detailKey));
    const rows = [];
    CATEGORY_KEYS.forEach((category) => {
      const item = run.cases.find((entry) => entry.category === category);
      const row = el(document, 'tr');
      row.dataset.category = category;
      row.append(el(document, 'td', 'task-cell', item.label), armCell(document, item.arms.orqanix), armCell(document, item.arms.vanilla));
      const usage = el(document, 'td', 'usage-cell');
      usage.append(el(document, 'span', 'usage-line', `Orqanix: ${usageText(item.arms.orqanix.usage)}`),
        el(document, 'span', 'usage-line', `Direct: ${usageText(item.arms.vanilla.usage)}`));
      row.append(usage);
      const info = el(document, 'td', 'info-cell');
      const button = el(document, 'button', 'info-button', 'ⓘ');
      const key = `${run.runId}-${category}`;
      const detailRow = el(document, 'tr', 'detail-row');
      detailRow.id = `details-${category}`;
      detailRow.hidden = !expanded.has(key);
      button.type = 'button';
      button.dataset.detailKey = key;
      button.setAttribute('aria-label', `${item.label}: prompt, checks and evidence`);
      button.setAttribute('aria-expanded', String(!detailRow.hidden));
      button.setAttribute('aria-controls', detailRow.id);
      button.addEventListener('click', () => { detailRow.hidden = !detailRow.hidden; button.setAttribute('aria-expanded', String(!detailRow.hidden)); });
      info.append(button);
      row.append(info);
      const content = el(document, 'td', 'expanded-info');
      content.colSpan = 5;
      content.append(el(document, 'p', 'result-explanation', interpretation(item)));
      content.append(el(document, 'strong', '', 'Exact prompt sent to both paths'), el(document, 'pre', 'prompt-text', item.prompt));
      const retiredReview = ARM_KEYS.some((name) => item.arms[name].originalEvaluationVerdict !== undefined);
      content.append(el(document, 'strong', '', retiredReview ? 'Original prompt criteria — earlier review' : 'Requested outcome and checks'));
      if (retiredReview) content.append(el(document, 'p', 'record-line', 'These earlier criteria are preserved for auditing. Retired constraints do not establish the current task outcome.'));
      const criteria = el(document, 'ul', 'criteria-list');
      item.criteria.forEach((criterion) => criteria.append(el(document, 'li', '', criterion)));
      content.append(criteria);
      ARM_KEYS.forEach((name) => {
        const arm = item.arms[name];
        const label = name === 'orqanix' ? 'Orqanix' : 'Direct model';
        const line = el(document, 'p', 'evidence-line');
        line.append(el(document, 'strong', '', `${label}: `), document.createTextNode(`${outcome(arm).text}. ${reviewLabel(arm).text}. `));
        if (arm.status !== 'completed' || arm.evaluationVerdict !== 'passed') line.append(document.createTextNode(`${failureReason(arm)} `));
        line.append(receipt(document, arm, item.category, name));
        content.append(line);
        if (arm.evaluationNotice) content.append(el(document, 'p', 'revision-notice', arm.evaluationNotice));
        if (arm.evaluationKind === 'advisory') content.append(el(document, 'p', 'record-line', 'Jev is an advisory review of whether the answer addresses the requested outcome and evidence. Its confidence is not a probability of task success.'));
        if (Array.isArray(arm.criteriaResults)) {
          if (arm.originalEvaluationVerdict !== undefined) content.append(el(document, 'strong', '', 'Original recorded checks — review outdated'));
          const results = el(document, 'ul', 'criteria-list');
          arm.criteriaResults.forEach((check) => {
            if (isRecord(check) && typeof check.criterion === 'string' && typeof check.passed === 'boolean') {
              results.append(el(document, 'li', '', `${arm.evaluationKind === 'advisory' ? (check.passed ? 'Supported' : 'Concern') : (check.passed ? 'Passed' : 'Failed')}: ${check.criterion}${typeof check.reason === 'string' ? ` — ${check.reason}` : ''}`));
            }
          });
          content.append(results);
        }
        content.append(el(document, 'p', 'record-line', `${label}: ${arm.resolvedModel || arm.model}${arm.resolvedModel ? '' : ' (resolved identity not reported)'} · ${arm.endpoint}`));
        content.append(el(document, 'p', 'hash-line', `${label} output SHA-256: ${arm.outputHash || 'unavailable'}`));
        if (arm.error || arm.evaluationReason) content.append(el(document, 'p', 'record-line', `Recorded reason: ${arm.error || arm.evaluationReason}`));
      });
      content.append(el(document, 'p', 'record-line', `Prompt: ${item.templateId} v${item.templateVersion} · seed ${item.seed}`),
        el(document, 'p', 'hash-line', `Input SHA-256: ${item.inputHash}`));
      detailRow.append(content);
      rows.push(row, detailRow);
    });
    replaceChildren(body, rows);
  }

  function renderControls(document, summary, state) {
    const target = document.getElementById('evaluation-window-cards');
    if (target) replaceChildren(target, WINDOW_KEYS.map((key) => {
      const button = el(document, 'button', 'window-button', key === '15m' ? '15 minutes' : key === '3h' ? '3 hours' : '24 hours');
      button.type = 'button';
      button.dataset.window = key;
      button.setAttribute('aria-pressed', String(key === state.windowKey));
      button.addEventListener('click', () => { state.windowKey = key; state.runId = null; renderControls(document, summary, state); });
      return button;
    }));
    const runs = runsForWindow(summary, state.windowKey);
    const chosen = chooseRun(summary, state.windowKey, state.runId);
    const selector = document.getElementById('evaluation-run-select');
    if (selector) {
      const choices = runs.length ? runs : chosen ? [chosen] : [];
      replaceChildren(selector, choices.map((run, index) => {
        const option = el(document, 'option', '', `${index === 0 ? 'Latest' : 'Previous'} · ${new Date(run.finishedAt).toLocaleString()}`);
        option.value = run.runId;
        option.selected = run.runId === chosen?.runId;
        return option;
      }));
      selector.disabled = choices.length < 2;
      selector.onchange = () => { state.runId = selector.value; renderControls(document, summary, state); };
    }
    const historyNote = document.getElementById('evaluation-history-note');
    if (historyNote) historyNote.textContent = runs.length
      ? `${runs.length} ${runs.length === 1 ? 'run' : 'runs'} in this window. Select an earlier run to inspect its prompt.`
      : chosen ? 'No run finished in this window. Showing the latest available result.' : 'No runs in this window.';
    const meta = document.getElementById('latest-run-meta');
    if (meta) meta.textContent = chosen ? `Run ${chosen.runId} · source ${chosen.runnerRevision || 'not recorded'} · finished ${new Date(chosen.finishedAt).toISOString()}` : 'No run available.';
    const revisionNotice = document.getElementById('evaluation-revision-notice');
    if (revisionNotice) {
      const earlier = chosen?.runnerRevision && summary.latest?.runnerRevision && chosen.runnerRevision !== summary.latest.runnerRevision;
      revisionNotice.hidden = !earlier;
      revisionNotice.textContent = earlier ? 'Earlier evaluator version: these are the scores recorded then. Later scoring fixes are not applied to this historical run.' : '';
    }
    renderTable(document, chosen);
  }

  function unavailable(document, reason) {
    const freshness = document.getElementById('evaluation-freshness');
    if (freshness) { freshness.textContent = 'Results unavailable'; freshness.dataset.state = 'unavailable'; }
    const observed = document.getElementById('evaluation-observed');
    if (observed) observed.textContent = reason || 'The current results could not be loaded. No performance conclusion can be drawn.';
    const selector = document.getElementById('evaluation-run-select');
    if (selector) { selector.disabled = true; replaceChildren(selector, []); }
    replaceChildren(document.getElementById('evaluation-window-cards'), []);
    const note = document.getElementById('evaluation-history-note');
    if (note) note.textContent = '';
    const meta = document.getElementById('latest-run-meta');
    if (meta) meta.textContent = 'No valid run available.';
    const notice = document.getElementById('evaluation-revision-notice');
    if (notice) { notice.hidden = true; notice.textContent = ''; }
    renderTable(document, null);
  }

  function render(document, summary) {
    if (!validateSummary(summary)) { unavailable(document, 'The published results failed validation. No performance conclusion can be drawn.'); return false; }
    const freshness = deriveFreshness(summary, Date.now());
    if (freshness === null) { unavailable(document, 'The published results contain a future timestamp. No performance conclusion can be drawn.'); return false; }
    let state = viewStates.get(document);
    if (!state) { state = { windowKey: '15m', runId: null }; viewStates.set(document, state); }
    setFreshness(document, summary, freshness);
    renderControls(document, summary, state);
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

  return { CATEGORY_KEYS, SUMMARY_SCHEMA, WINDOW_KEYS, chooseRun, deriveFreshness, failureReason, formatDuration, interpretation, load, outcome, render, reviewLabel, runsForWindow, safeEvidenceHref, start, usageText, validateSummary };
});
