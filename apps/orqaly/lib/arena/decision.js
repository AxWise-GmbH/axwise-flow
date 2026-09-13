/**
 * Arena decision engine — pure, no database, no network.
 *
 * Turns raw job pairs into the recommendation shown on the Decide view. Kept
 * separate from the handler because these are the numbers a business acts on:
 * they need to be testable in isolation and readable by whoever questions them
 * in a room.
 *
 * Two rules run through everything here:
 *   1. A missing input produces null, never zero. No rate means no money, not a
 *      free job. A fabricated saving is worse than no saving.
 *   2. Nothing in this file acts. It recommends, and exposes every number behind
 *      the recommendation so a person can disagree with it.
 */

export const RECOMMENDATIONS = ['hand_over', 'assist', 'keep_human', 'not_enough_yet'];
export const CONFIDENCE = ['none', 'low', 'good'];

/** Below this many compared jobs, no recommendation is honest. */
export const MIN_SAMPLE = 5;
/** At or above this, the sample is good enough to be called good. */
export const GOOD_SAMPLE = 15;

const DAYS_IN_MONTH = 30;

/* ── rates ────────────────────────────────────────────────────────────────── */

/**
 * Resolve what a person costs. Order is person, then role, then department.
 * Within a scope the most recent `effective_from` not in the future wins.
 *
 * @returns {{ currency: string, hourlyRate: number|null, perJobCost: number|null, scope: string }|null}
 */
export function resolveRate(rates, { person, role, department, on } = {}) {
  if (!Array.isArray(rates) || rates.length === 0) return null;
  const asOf = on ? new Date(on) : null;
  const wanted = [
    ['person', person],
    ['role', role],
    ['department', department],
  ];

  for (const [scope, key] of wanted) {
    if (!key) continue;
    const needle = String(key).trim().toLowerCase();
    const matches = rates
      .filter(
        (r) =>
          r.scope === scope &&
          String(r.key || '')
            .trim()
            .toLowerCase() === needle
      )
      .filter((r) => {
        if (!asOf || !r.effective_from) return true;
        return new Date(r.effective_from) <= asOf;
      })
      .sort((a, b) => String(b.effective_from || '').localeCompare(String(a.effective_from || '')));

    const hit = matches[0];
    if (hit) {
      return {
        currency: hit.currency || 'EUR',
        hourlyRate: numberOrNull(hit.hourly_rate),
        perJobCost: numberOrNull(hit.per_job_cost),
        scope,
      };
    }
  }
  return null;
}

/**
 * What one job cost a person. A per-job price wins over an hourly rate, because
 * it is the price actually paid. Returns null when the rate or the time is
 * missing — the job then sits out of every cost average rather than reading as
 * free work.
 */
export function personCost(rate, minutesSpent) {
  if (!rate) return null;
  if (rate.perJobCost != null) return round4(rate.perJobCost);
  if (rate.hourlyRate == null) return null;
  const minutes = numberOrNull(minutesSpent);
  if (minutes == null || minutes < 0) return null;
  return round4((rate.hourlyRate * minutes) / 60);
}

/* ── per-department statistics ────────────────────────────────────────────── */

/**
 * Fold job pairs into the measures the Decide view reads.
 *
 * A "pair" is a job where BOTH sides delivered. Averages are taken only over
 * pairs where both sides have the value in question, so a department where half
 * the human costs are unknown does not report a misleadingly cheap average.
 *
 * @param {Array} pairs  [{ verdict, people, agents }] where each side is a
 *                       submission-shaped object or null.
 * @param {object} opts  { stakes, monthlyVolume, comparedTotal }
 */
export function computeDepartmentStats(pairs, { stakes = 'medium', monthlyVolume = null } = {}) {
  const both = (pairs || []).filter((p) => p && p.people && p.agents);
  const n = both.length;

  const wins = { people: 0, agents: 0, tie: 0 };
  for (const p of both) {
    if (p.verdict && wins[p.verdict] !== undefined) wins[p.verdict] += 1;
  }
  const decided = wins.people + wins.agents + wins.tie;
  const winRate = decided > 0 ? wins.agents / decided : null;

  const avgStars = {
    people: avgOf(both, (p) => p.people.rating),
    agents: avgOf(both, (p) => p.agents.rating),
  };
  const avgCost = pairedAvg(both, (s) => s.cost_usd);
  const avgMinutes = pairedAvg(both, (s) => s.minutes_spent);
  const reworkRate = {
    people: rateOf(both, (p) => p.people),
    agents: rateOf(both, (p) => p.agents),
  };

  const qualityDelta = delta(avgStars.agents, avgStars.people);
  const costDelta = delta(avgCost.people, avgCost.agents); // positive = agents cheaper
  const timeDelta = delta(avgMinutes.people, avgMinutes.agents); // positive = agents faster
  const reworkDelta = delta(reworkRate.people, reworkRate.agents); // positive = agents rework less

  const coverage = monthlyVolume && monthlyVolume > 0 ? Math.min(1, n / monthlyVolume) : null;

  return {
    n,
    decided,
    wins,
    winRate,
    avgStars,
    avgCost,
    avgMinutes,
    reworkRate,
    qualityDelta,
    costDelta,
    timeDelta,
    reworkDelta,
    coverage,
    stakes,
    monthlyVolume: monthlyVolume ?? null,
  };
}

/* ── confidence and recommendation ────────────────────────────────────────── */

/**
 * How much the sample can be trusted. High-stakes departments are dropped one
 * level, so Legal and Accountants need roughly triple the evidence before Arena
 * will suggest anything: a wrong contract review and a wrong banner do not cost
 * the same.
 */
export function confidenceFor(n, stakes = 'medium') {
  let level = n < MIN_SAMPLE ? 'none' : n < GOOD_SAMPLE ? 'low' : 'good';
  if (stakes === 'high') level = level === 'good' ? 'low' : 'none';
  return level;
}

/**
 * The recommendation, with the reasons that produced it.
 * @returns {{ recommendation: string, confidence: string, reasons: string[] }}
 */
export function recommend(stats) {
  const { n, winRate, qualityDelta, costDelta, timeDelta, reworkDelta, stakes } = stats;
  const confidence = confidenceFor(n, stakes);
  const reasons = [];

  if (n < MIN_SAMPLE) {
    return {
      recommendation: 'not_enough_yet',
      confidence,
      reasons: [`Only ${n} job${n === 1 ? '' : 's'} compared. Arena needs at least ${MIN_SAMPLE}.`],
    };
  }

  const agentsCheaper = costDelta != null && costDelta > 0;
  const agentsFaster = timeDelta != null && timeDelta > 0;
  const qualityHolds = qualityDelta != null && qualityDelta >= -0.2;
  const qualityFails = qualityDelta != null && qualityDelta < -0.8;
  const reworkWorse = reworkDelta != null && reworkDelta < 0;

  if ((winRate != null && winRate <= 0.4) || qualityFails) {
    if (winRate != null && winRate <= 0.4) {
      reasons.push(`People won or drew most of the ${n} jobs compared.`);
    }
    if (qualityFails) reasons.push('Agent quality is well below the people on this work.');
    return { recommendation: 'keep_human', confidence, reasons };
  }

  if (winRate != null && winRate >= 0.7 && qualityHolds && agentsCheaper && confidence !== 'none') {
    reasons.push(`Agents won ${stats.wins.agents} of ${stats.decided} decided jobs.`);
    if (qualityDelta > 0) reasons.push('They also rated higher.');
    reasons.push('They cost less per job.');
    if (agentsFaster) reasons.push('They deliver faster.');
    return { recommendation: 'hand_over', confidence, reasons };
  }

  if (agentsCheaper || agentsFaster) {
    if (agentsCheaper) reasons.push('Agents are cheaper per job.');
    if (agentsFaster) reasons.push('Agents are faster.');
    if (!qualityHolds) reasons.push('Quality still trails the people, so keep a human on review.');
    if (reworkWorse) reasons.push('Agent results need rework more often.');
    if (confidence === 'none') reasons.push('Sample is small for this department.');
    return { recommendation: 'assist', confidence, reasons };
  }

  reasons.push('Neither side is clearly ahead on cost, speed or quality yet.');
  return { recommendation: 'assist', confidence, reasons };
}

/* ── money ────────────────────────────────────────────────────────────────── */

/**
 * What handing this department over would be worth per month.
 *
 * Deliberately multiplied by `winRate` rather than assuming a full handover, so
 * the number stays conservative and survives being questioned. Returns nulls
 * when the volume or a rate is missing, and the UI shows a blank rather than a
 * zero.
 */
export function projectMoney(stats, { windowDays = DAYS_IN_MONTH } = {}) {
  const { costDelta, timeDelta, winRate, monthlyVolume, avgCost, n } = stats;
  const scale = windowDays > 0 ? DAYS_IN_MONTH / windowDays : 1;

  const monthlyAgentSpend =
    avgCost.agents != null && n > 0 ? round2(avgCost.agents * n * scale) : null;
  const monthlyPeopleCost =
    avgCost.people != null && n > 0 ? round2(avgCost.people * n * scale) : null;

  const canProject = monthlyVolume != null && monthlyVolume > 0 && winRate != null;

  return {
    monthlyAgentSpend,
    monthlyPeopleCost,
    projectedSaving:
      canProject && costDelta != null ? round2(costDelta * monthlyVolume * winRate) : null,
    capacityReleasedHours:
      canProject && timeDelta != null ? round2((timeDelta * monthlyVolume * winRate) / 60) : null,
  };
}

/* ── helpers ──────────────────────────────────────────────────────────────── */

function numberOrNull(v) {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

function avgOf(rows, pick) {
  const vals = rows
    .map(pick)
    .map(numberOrNull)
    .filter((v) => v != null);
  if (!vals.length) return null;
  return round4(vals.reduce((a, b) => a + b, 0) / vals.length);
}

/**
 * Average each side, but only over pairs where BOTH sides have the value —
 * otherwise the two averages describe different job sets and their difference
 * means nothing.
 */
function pairedAvg(pairs, pick) {
  const usable = pairs.filter(
    (p) => numberOrNull(pick(p.people)) != null && numberOrNull(pick(p.agents)) != null
  );
  if (!usable.length) return { people: null, agents: null, pairs: 0 };
  return {
    people: avgOf(usable, (p) => pick(p.people)),
    agents: avgOf(usable, (p) => pick(p.agents)),
    pairs: usable.length,
  };
}

/** Share of a side's submissions that needed rework. */
function rateOf(pairs, pick) {
  const rows = pairs.map(pick).filter(Boolean);
  if (!rows.length) return null;
  const reworked = rows.filter((r) => r.outcome === 'rework' || (r.reworked_count || 0) > 0).length;
  return round4(reworked / rows.length);
}

function delta(a, b) {
  if (a == null || b == null) return null;
  return round4(a - b);
}

function round2(n) {
  return Math.round(n * 100) / 100;
}

function round4(n) {
  return Math.round(n * 10000) / 10000;
}
