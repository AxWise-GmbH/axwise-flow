/**
 * Ask Anything — information answers for reports, formulas, and metrics.
 * Used when the user asks how something is calculated, how it works, or where data comes from.
 */

export const INFO_TOPICS = {
  cr: 'cr',
  ftd: 'ftd',
  roi: 'roi',
  cac: 'cac',
  revenue: 'revenue',
  spend: 'spend',
  clicks: 'clicks',
  reports: 'reports',
  dashboard: 'dashboard',
  formulas: 'formulas',
  partners: 'partners',
};

/**
 * Get structured explanation for a topic: how it's calculated, how it works, source, related.
 * @param {string} topic - One of INFO_TOPICS
 * @returns {{ title: string, howCalculated: string, howItWorks: string, source: string, related: string[] } | null}
 */
export function getInfoContent(topic) {
  const content = INFO_CONTENT[topic];
  return content ? { ...content } : null;
}

/**
 * Match user query to one or more info topics.
 * @param {string} text - User's question (e.g. "how is CR calculated?")
 * @returns {string[]} - Array of topic keys (can be multiple for broad questions like "formulas")
 */
export function matchInfoTopics(text) {
  if (!text || typeof text !== 'string') return [];
  const t = text.trim().toLowerCase();
  const topics = [];

  if (
    /\b(?:cr|conversion\s*rate|conversion\s*ratio)\b/.test(t) ||
    /\bhow\s+is\s+cr\b|\bwhat\s+is\s+cr\b|\bcr\s+calculated\b|\bcr%\b/.test(t)
  ) {
    topics.push(INFO_TOPICS.cr);
  }
  if (/\bftd\b|\bfirst\s+time\s+deposit\b|\bhow\s+is\s+ftd\b|\bwhat\s+is\s+ftd\b/.test(t)) {
    topics.push(INFO_TOPICS.ftd);
  }
  if (/\broi\b|\breturn\s+on\s+investment\b|\bhow\s+is\s+roi\b|\bwhat\s+is\s+roi\b/.test(t)) {
    topics.push(INFO_TOPICS.roi);
  }
  if (/\bcac\b|\bcustomer\s+acquisition\s+cost\b|\bhow\s+is\s+cac\b|\bwhat\s+is\s+cac\b/.test(t)) {
    topics.push(INFO_TOPICS.cac);
  }
  if (/\brevenue\b|\bwhere\s+.*revenue\b|\bhow\s+.*revenue\b/.test(t)) {
    topics.push(INFO_TOPICS.revenue);
  }
  if (/\bspend(?:ing)?\b|\bad\s+spend\b|\bwhere\s+.*spend\b/.test(t)) {
    topics.push(INFO_TOPICS.spend);
  }
  if (/\bclicks?\b|\bhow\s+.*clicks\b|\bwhere\s+.*clicks\b/.test(t)) {
    topics.push(INFO_TOPICS.clicks);
  }
  if (
    /\breport\b|\bmonthly\s+report\b|\bpartner\s+report\b|\bhow\s+.*report\b|\bwhere\s+.*report\b/.test(
      t
    )
  ) {
    topics.push(INFO_TOPICS.reports);
  }
  if (
    /\bdashboard\b|\bhow\s+.*dashboard\b|\bwhere\s+.*dashboard\b|\bmetrics?\s+on\s+dashboard\b/.test(
      t
    )
  ) {
    topics.push(INFO_TOPICS.dashboard);
  }
  if (
    /\bformula\b|\bformulas?\b|\bhow\s+.*calculated\b|\bcalculation\b|\bhow\s+.*work\b/.test(t) &&
    topics.length === 0
  ) {
    topics.push(INFO_TOPICS.formulas);
  }
  if (/\bpartners?\s+(?:data|info|from)\b|\bwhere\s+.*partners?\s+.*from\b/.test(t)) {
    topics.push(INFO_TOPICS.partners);
  }

  return [...new Set(topics)];
}

const INFO_CONTENT = {
  [INFO_TOPICS.cr]: {
    title: 'CR (Conversion Rate)',
    howCalculated:
      'CR% = (FTD ÷ Clicks) × 100. For a campaign: CR is stored per campaign. For aggregates (e.g. Dashboard), it is the weighted conversion rate: total FTD across campaigns ÷ total Clicks, then × 100.',
    howItWorks:
      'Conversion rate measures how many visitors (clicks) became first-time depositors. Higher CR means better funnel performance. It is shown per campaign on the Partners page and as an overall weighted metric on the Dashboard.',
    source:
      'Campaign-level CR comes from partner/campaign data (Partners → campaign cards or Campaigns drawer). Dashboard CR is computed from all partners’ campaigns for the selected period using getCampaignMetricsForPeriod and then aggregated.',
    related: ['FTD', 'Clicks', 'Dashboard metrics', 'Campaigns drawer'],
  },
  [INFO_TOPICS.ftd]: {
    title: 'FTD (First Time Deposit)',
    howCalculated:
      'FTD is the count of first-time deposits. It is summed from each campaign’s FTD (or from monthly stats when period is selected). Formula: total FTD = sum of campaign FTD for the selected period. For past months without monthlyStats, the app may use the campaign’s base FTD with a deterministic factor for display.',
    howItWorks:
      'FTD is the primary volume metric: how many new depositors each campaign or partner brought. It is used to compute CR (with clicks), and to weight ROI and other averages on the Dashboard.',
    source:
      'Stored on each campaign (partner.campaigns[].ftd) and optionally in campaign.monthlyStats or campaign.metricsByMonth by period. Dashboard and reports use getCampaignMetricsForPeriod(partner, period) to get period-specific FTD.',
    related: ['CR', 'Clicks', 'ROI', 'CAC', 'Dashboard', 'Partner report'],
  },
  [INFO_TOPICS.roi]: {
    title: 'ROI (Return on Investment)',
    howCalculated:
      'ROI% = ((Revenue − Spend) ÷ Spend) × 100. At partner level it uses the partner’s total campaign revenue and spend. On the Dashboard, average ROI is weighted by FTD: sum(partner ROI × partner FTD) ÷ sum(partner FTD).',
    howItWorks:
      'ROI shows profitability of spend. Positive ROI means revenue exceeds cost. It is shown per partner (from their campaigns) and as a weighted average on the Dashboard.',
    source:
      'Revenue and spend come from partner.campaigns[].revenue and partner.campaigns[].spend. Partner-level ROI is computed in partnerService (computePerformance). Dashboard uses the same campaign totals and then applies FTD-weighted average.',
    related: ['Revenue', 'Spend', 'FTD', 'Dashboard', 'Partner report'],
  },
  [INFO_TOPICS.cac]: {
    title: 'CAC (Customer Acquisition Cost)',
    howCalculated:
      'CAC = Total Spend ÷ Total FTD. So it is the average cost per first-time deposit. On the Dashboard, average CAC = total spend across all partners ÷ total FTD.',
    howItWorks:
      'CAC tells you how much you pay per acquired depositor. Lower is better. It is derived from the same campaign spend and FTD used for ROI.',
    source:
      'Spend and FTD from partner campaigns (partner.campaigns[].spend and FTD). Computed in Dashboard (computeMetrics) and in partnerService computePerformance.',
    related: ['Spend', 'FTD', 'ROI', 'Dashboard'],
  },
  [INFO_TOPICS.revenue]: {
    title: 'Revenue',
    howCalculated:
      'Revenue is the sum of campaign revenue: sum of partner.campaigns[].revenue. For a selected period, only revenue attributed to that period is used (when monthly stats or metricsByMonth are available).',
    howItWorks:
      'Revenue is the income from campaigns. It is used with spend to compute ROI and profitability. Dashboard profitability = ((total revenue − total spend) ÷ total spend) × 100.',
    source:
      'Stored per campaign (partner.campaigns[].revenue). Aggregated in Dashboard (computeMetrics) and in partner reports. Period-specific values come from getCampaignMetricsForPeriod where supported.',
    related: ['Spend', 'ROI', 'FTD', 'Dashboard', 'Partner report'],
  },
  [INFO_TOPICS.spend]: {
    title: 'Spend (Ad Spend)',
    howCalculated:
      'Spend is the sum of campaign spend: sum of partner.campaigns[].spend. It is not period-split in the same way as FTD/clicks; the Dashboard uses the campaign’s total spend for the partner’s totals.',
    howItWorks:
      'Spend represents the cost side. It is used in ROI and CAC. Total spend and total revenue together drive profitability on the Dashboard.',
    source:
      'Stored per campaign (partner.campaigns[].spend). Aggregated in partnerService computePerformance and in Dashboard computeMetrics.',
    related: ['Revenue', 'ROI', 'CAC', 'Dashboard'],
  },
  [INFO_TOPICS.clicks]: {
    title: 'Clicks',
    howCalculated:
      'Clicks can be stored on the campaign (campaign.clicks or campaign.monthlyStats[].clicks). If not set, they are derived when CR and FTD exist: Clicks = FTD ÷ (CR/100). Total clicks are summed across campaigns for the period.',
    howItWorks:
      'Clicks are the traffic volume. They are the denominator for CR. Dashboard weighted CR uses total FTD and total clicks across partners.',
    source:
      'Campaign data (campaign.clicks or getCampaignClicks helper). Period-specific values from getCampaignMetricsForPeriod (monthlyStats or metricsByMonth).',
    related: ['CR', 'FTD', 'Dashboard'],
  },
  [INFO_TOPICS.reports]: {
    title: 'Reports',
    howCalculated:
      'Partner reports (PDF) are generated by generatePartnerReport: they use the selected period, periodized campaign metrics (getCampaignMetricsForPeriod), finance summary (getFinanceSummary, getFinanceForPeriod), CR trend data, and optional insights/recommendations. Export CSV uses exportPartnersCsv with partner and campaign fields.',
    howItWorks:
      'Reports give a snapshot of partner performance and finances for a period. The PDF includes metrics, comparison, and notes. Data is pulled from the same partner/campaign sources as the app.',
    source:
      'Data comes from Partners (partner list and detail), campaign metrics by period (getCampaignMetricsForPeriod), finance (getFinanceSummary, getFinanceForPeriod), and optionally AI recommendations. Reports are generated on demand from the Partner detail page or export actions.',
    related: ['Dashboard', 'FTD', 'CR', 'ROI', 'CAC', 'Partner detail', 'Export CSV'],
  },
  [INFO_TOPICS.dashboard]: {
    title: 'Dashboard metrics',
    howCalculated:
      'Dashboard uses computeMetrics(filteredPartners, period): it sums FTD, clicks, spend, revenue from each partner’s campaigns (via getCampaignMetricsForPeriod), then computes weighted CR, FTD-weighted average ROI, average CAC (spend/FTD), FTD per partner, and profitability = (revenue − spend) / spend × 100. Funnel counts and task stats come from partner.funnelStatus and partner.tasks.',
    howItWorks:
      'The Dashboard shows period-based KPIs and comparisons (current vs previous period). Filters (team, geo, agreement, funnel) apply to the partner list before metrics are computed. All numbers are derived from the same partner and campaign data as the rest of the app.',
    source:
      'Partners list (filtered), each partner’s campaigns and getCampaignMetricsForPeriod(period). Finance from getFinanceSummary and getFinanceForPeriod. Defined in Dashboard.jsx and uses getCampaignMetricsForPeriod from periodMetrics.js.',
    related: ['FTD', 'CR', 'ROI', 'CAC', 'Revenue', 'Spend', 'Partners', 'Filters'],
  },
  [INFO_TOPICS.formulas]: {
    title: 'Key formulas',
    howCalculated:
      'CR% = (FTD ÷ Clicks) × 100. ROI% = ((Revenue − Spend) ÷ Spend) × 100. CAC = Spend ÷ FTD. Profitability (Dashboard) = ((Revenue − Spend) ÷ Spend) × 100. Weighted CR (Dashboard) = (total FTD ÷ total Clicks) × 100. Weighted average ROI = sum(partner ROI × partner FTD) ÷ sum(partner FTD).',
    howItWorks:
      'These formulas are used consistently in the Dashboard, Partner detail, and reports. Period selection uses getCampaignMetricsForPeriod to get FTD/clicks/CR for that month; spend and revenue are from campaign totals.',
    source:
      'Implemented in Dashboard.jsx (computeMetrics), partnerService.js (computePerformance), and periodMetrics.js (getCampaignMetricsForPeriod, getFinanceForPeriod).',
    related: ['CR', 'FTD', 'ROI', 'CAC', 'Revenue', 'Spend', 'Dashboard', 'Reports'],
  },
  [INFO_TOPICS.partners]: {
    title: 'Where partner data comes from',
    howCalculated:
      'Partner list and detail are loaded from the backend (Supabase) via partnerService. Each partner has campaigns (array); each campaign has ftd, clicks, cr, spend, revenue, status. Metrics can be stored per month in campaign.monthlyStats or campaign.metricsByMonth.',
    howItWorks:
      'The app reads partners once (e.g. usePartners hook) and then all Dashboard, reports, and tables compute from that data. Exports and PDF reports use the same in-memory or fetched data.',
    source:
      'Backend (Supabase) and partnerService. Optional: local storage or API. Constants (agreement types, groups, etc.) from utils/constants.js.',
    related: ['Dashboard', 'Reports', 'CR', 'FTD', 'ROI', 'Export CSV'],
  },
};
