/**
 * Data-driven narrative + insight generation for PDF exports.
 *
 * Replaces the canned per-category boilerplate with insights derived from
 * the snapshot's actual KPI values, deltas, alerts, and ranked entries.
 */

import { formatValue, truncate } from './format';

function classifyDelta(change) {
  if (change == null || Number.isNaN(Number(change))) return null;
  const n = Number(change);
  if (Math.abs(n) < 0.5) return 'flat';
  return n > 0 ? 'up' : 'down';
}

function topMovers(kpis, limit = 3) {
  return (kpis || [])
    .filter((k) => k.change != null && !Number.isNaN(Number(k.change)))
    .sort((a, b) => Math.abs(Number(b.change)) - Math.abs(Number(a.change)))
    .slice(0, limit);
}

function topByValue(rows, key, limit = 3) {
  if (!Array.isArray(rows) || rows.length === 0) return [];
  return [...rows]
    .filter((r) => r && r[key] != null)
    .sort((a, b) => (Number(b[key]) || 0) - (Number(a[key]) || 0))
    .slice(0, limit);
}

export function buildHeadline(snapshot, template) {
  const kpis = snapshot?.kpis || [];
  const movers = topMovers(kpis, 1);
  if (movers.length > 0) {
    const m = movers[0];
    const dir =
      classifyDelta(m.change) === 'up'
        ? 'up'
        : classifyDelta(m.change) === 'down'
          ? 'down'
          : 'steady';
    return `${m.label} ${dir} ${Math.abs(Number(m.change)).toFixed(1)}% at ${formatValue(m.value, m.format)}`;
  }
  if (kpis.length > 0) {
    return `${kpis[0].label}: ${formatValue(kpis[0].value, kpis[0].format)}`;
  }
  return template?.name || 'Report summary';
}

export function buildExecutiveSummary(snapshot, template) {
  const lines = [];
  const kpis = snapshot?.kpis || [];
  const alerts = collectAlerts(snapshot);

  if (template?.description) {
    lines.push(template.description);
  }

  const movers = topMovers(kpis, 3);
  if (movers.length > 0) {
    const phrases = movers.map((m) => {
      const dir = classifyDelta(m.change);
      const arrow = dir === 'up' ? '+' : dir === 'down' ? '-' : '~';
      return `${m.label} (${arrow}${Math.abs(Number(m.change)).toFixed(1)}%, now ${formatValue(m.value, m.format)})`;
    });
    lines.push(`Biggest movers this period: ${phrases.join('; ')}.`);
  } else if (kpis.length > 0) {
    const head = kpis[0];
    lines.push(`${head.label} is at ${formatValue(head.value, head.format)}.`);
  }

  const errors = alerts.filter((a) => a.severity === 'error');
  const warnings = alerts.filter((a) => a.severity === 'warning');
  if (errors.length > 0) {
    lines.push(
      `${errors.length} critical alert${errors.length === 1 ? '' : 's'} need attention: ${errors
        .slice(0, 3)
        .map((a) => a.title)
        .join(', ')}.`
    );
  } else if (warnings.length > 0) {
    lines.push(`${warnings.length} warning${warnings.length === 1 ? '' : 's'} worth a glance.`);
  } else {
    lines.push('No critical alerts firing across the tracked metrics.');
  }

  return lines.join(' ');
}

export function collectAlerts(snapshot) {
  if (!snapshot) return [];
  const buckets = [
    snapshot.alerts,
    snapshot.agentAlerts,
    snapshot.goalAlerts,
    snapshot.kbAlerts,
    snapshot.qualityAlerts,
    snapshot.pulseAlerts,
    snapshot.strategyAlerts,
  ];
  const out = [];
  buckets.forEach((bucket) => {
    if (Array.isArray(bucket)) {
      bucket.forEach((a) => out.push(a));
    }
  });
  const seen = new Set();
  return out.filter((a) => {
    const key = `${a.severity || 'info'}::${a.title || ''}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function buildInsights(snapshot, template) {
  const insights = [];
  const kpis = snapshot?.kpis || [];
  const alerts = collectAlerts(snapshot);

  topMovers(kpis, 3).forEach((m) => {
    const dir = classifyDelta(m.change);
    if (dir === 'up') {
      insights.push(
        `${m.label} is trending up ${Math.abs(Number(m.change)).toFixed(1)}% to ${formatValue(m.value, m.format)} - investigate which inputs are driving this momentum so it can be repeated.`
      );
    } else if (dir === 'down') {
      insights.push(
        `${m.label} dropped ${Math.abs(Number(m.change)).toFixed(1)}% to ${formatValue(m.value, m.format)} - dig into the underlying segments before the gap widens.`
      );
    }
  });

  if (snapshot?.topPartners || snapshot?.partnerLeaderboard) {
    const top = topByValue(snapshot.partnerLeaderboard || snapshot.topPartners, 'revenue', 1)[0];
    if (top) {
      insights.push(
        `${top.name || 'A single partner'} contributes the most revenue (${formatValue(top.revenue, 'currency')}). Concentration risk worth monitoring.`
      );
    }
  }

  if (snapshot?.geoBreakdown && snapshot.geoBreakdown.length > 0) {
    const total = snapshot.geoBreakdown.reduce((sum, g) => sum + (Number(g.revenue) || 0), 0);
    const top = topByValue(snapshot.geoBreakdown, 'revenue', 1)[0];
    if (top && total > 0) {
      const share = (Number(top.revenue) / total) * 100;
      insights.push(
        `${top.geo} accounts for ${share.toFixed(1)}% of geographic revenue - consider whether other regions deserve more investment.`
      );
    }
  }

  if (snapshot?.agentLeaderboard && snapshot.agentLeaderboard.length > 0) {
    const lowPerformers = snapshot.agentLeaderboard.filter(
      (a) => a.jobs >= 3 && a.successRate != null && a.successRate < 70
    );
    if (lowPerformers.length > 0) {
      insights.push(
        `${lowPerformers.length} agent${lowPerformers.length === 1 ? '' : 's'} below 70% success: ${lowPerformers
          .slice(0, 3)
          .map((a) => a.name)
          .join(', ')}. Review prompts and tool wiring.`
      );
    }
  }

  if (snapshot?.goalStageFunnel && snapshot.goalStageFunnel.length > 1) {
    const stages = snapshot.goalStageFunnel;
    let worstDrop = null;
    for (let i = 1; i < stages.length; i += 1) {
      const prev = Number(stages[i - 1].count) || 0;
      const curr = Number(stages[i].count) || 0;
      if (prev > 0) {
        const drop = ((prev - curr) / prev) * 100;
        if (!worstDrop || drop > worstDrop.drop) {
          worstDrop = { from: stages[i - 1].stage, to: stages[i].stage, drop };
        }
      }
    }
    if (worstDrop && worstDrop.drop > 30) {
      insights.push(
        `Biggest goal drop-off is from ${worstDrop.from} to ${worstDrop.to} (-${worstDrop.drop.toFixed(0)}%). Look at handoff or capacity bottlenecks at that stage.`
      );
    }
  }

  if (snapshot?.overdueItems && snapshot.overdueItems.length > 0) {
    insights.push(
      `${snapshot.overdueItems.length} item${snapshot.overdueItems.length === 1 ? '' : 's'} flagged as overdue or at-risk. Prioritise the top three this week.`
    );
  }

  const errors = alerts.filter((a) => a.severity === 'error');
  if (errors.length > 0) {
    errors.slice(0, 2).forEach((a) => {
      insights.push(`${a.title}${a.detail ? ` - ${truncate(a.detail, 100)}` : ''}`);
    });
  }

  if (insights.length === 0) {
    insights.push(
      `Data set is currently steady for ${template?.name || 'this view'}; keep an eye on the next refresh for emerging signals.`
    );
  }

  return insights.slice(0, 6);
}

export function buildRecommendations(snapshot, template) {
  const recs = [];
  const kpis = snapshot?.kpis || [];

  const movers = topMovers(kpis, 5);
  const down = movers.filter((m) => classifyDelta(m.change) === 'down');
  const up = movers.filter((m) => classifyDelta(m.change) === 'up');

  if (down.length > 0) {
    recs.push(
      `Stabilise the declining metrics first: ${down
        .slice(0, 2)
        .map((m) => m.label)
        .join(' and ')}.`
    );
  }
  if (up.length > 0) {
    recs.push(
      `Double down on what is working: protect the gains in ${up
        .slice(0, 2)
        .map((m) => m.label)
        .join(' and ')}.`
    );
  }

  const alerts = collectAlerts(snapshot);
  if (alerts.filter((a) => a.severity === 'error').length > 0) {
    recs.push('Triage every critical alert before the next reporting cycle.');
  }
  if (snapshot?.overdueItems?.length > 3) {
    recs.push('Redistribute overdue workload to keep delivery SLAs in green.');
  }
  if (snapshot?.agentLeaderboard?.length > 0) {
    recs.push('Schedule a prompt review for the lowest-performing agents this week.');
  }
  if (template?.category === 'knowledge' && (snapshot?.kbDocs?.length || 0) === 0) {
    recs.push('Connect at least one ingestion source so the knowledge base starts paying off.');
  }
  if (recs.length === 0) {
    recs.push(
      `Maintain the current cadence - the inputs feeding ${template?.name || 'this view'} are healthy.`
    );
  }
  return recs.slice(0, 4);
}
