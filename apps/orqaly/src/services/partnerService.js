import partnersData from '../mocks/partnersData';
import {
  loadPartners as loadPartnersBackend,
  savePartners as savePartnersBackend,
  getNextPartnerId,
} from './partnerBackend';
import { hasSupabase } from '../lib/supabase';
import { logAction, buildAgentMeta } from './auditLogBackend';
import { maybeNotify } from './emailNotificationDispatcher';

const delay = (ms = 300) => new Promise((r) => setTimeout(r, ms));
const STORAGE_KEY = 'orch_partners_data_v1';

const canUseStorage = () => typeof window !== 'undefined' && !!window.localStorage;
const clone = (value) => JSON.parse(JSON.stringify(value));
const toDateInput = (date) => date.toISOString().split('T')[0];
const addDays = (days = 0) => {
  const next = new Date();
  next.setDate(next.getDate() + days);
  return toDateInput(next);
};
const toIsoDate = (year, month, day) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
const partnerSeed = (partnerId = '') =>
  String(partnerId)
    .split('')
    .reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

const dummyMaterialTemplates = [
  { name: 'Q1 Creative Pack', type: 'creatives', links: ['https://drive.google.com/q1-assets'] },
  {
    name: 'Landing Page V2',
    type: 'landing',
    links: ['https://lp-preview.com/v2', 'https://lp-preview.com/v2-mobile'],
  },
  { name: 'Email Templates', type: 'templates', links: [] },
  { name: 'Compliance Guide', type: 'other', links: ['https://docs.partner.com/compliance'] },
  { name: 'Banner Set A', type: 'creatives', links: [] },
];

const generateDummyMaterials = (partnerStructured) => {
  // Handle potential structure variations
  let existing = [];
  if (Array.isArray(partnerStructured.materials)) {
    existing = partnerStructured.materials;
  } else if (Array.isArray(partnerStructured.materials?.items)) {
    existing = partnerStructured.materials.items;
  }

  let campaigns = [];
  if (Array.isArray(partnerStructured.campaigns)) {
    campaigns = partnerStructured.campaigns;
  } else if (Array.isArray(partnerStructured.campaigns?.items)) {
    campaigns = partnerStructured.campaigns.items;
  }

  const seed = partnerSeed(partnerStructured.id);

  // Enrich existing materials if missing data
  existing = existing.map((mat, idx) => {
    const changes = {};
    if (!mat.campaignIds || mat.campaignIds.length === 0) {
      // Assign random campaign
      if (campaigns.length > 0) {
        const camp = campaigns[(seed + idx) % campaigns.length];
        changes.campaignIds = [camp.id];
        changes.campaignNames = [camp.name];
      }
    }
    if (!mat.links || mat.links.length === 0) {
      // Assign random link
      changes.links = [`https://drive.google.com/file/d/${mat.id || 'gen'}`];
    }
    return { ...mat, ...changes };
  });

  if (existing.length > 0) return existing;

  const materials = [];
  const count = 2 + (seed % 3); // 2 to 4 materials

  for (let i = 0; i < count; i++) {
    const tpl = dummyMaterialTemplates[(seed + i) % dummyMaterialTemplates.length];

    // Associate with 0-2 random campaigns
    const campaignIds = [];
    const campaignNames = [];
    if (campaigns.length > 0) {
      const numCampaigns = (seed + i) % 3;
      for (let j = 0; j < numCampaigns; j++) {
        const camp = campaigns[(i + j) % campaigns.length];
        if (camp && !campaignIds.includes(camp.id)) {
          campaignIds.push(camp.id);
          campaignNames.push(camp.name);
        }
      }
    }

    // Sometimes use a campaign link as a material link (overlap)
    const links = [...(tpl.links || [])];
    if (campaigns.length > 0 && (seed + i) % 2 === 0) {
      const randomCamp = campaigns[i % campaigns.length];
      if (randomCamp?.regionLink) {
        links.push(randomCamp.regionLink);
      }
    }

    materials.push({
      id: `M-GEN-${partnerStructured.id}-${i}`,
      name: tpl.name,
      type: tpl.type,
      uploadedAt: toIsoDate(2025, 10 + (i % 3), 10 + i * 2),
      campaignIds,
      campaignNames,
      links: [...new Set(links)], // Dedupe
    });
  }
  return materials;
};

const dummyNotesOptions = [
  'Focusing on mobile traffic for Q1. Scaling up budget next month.',
  'Requested higher cap for Casino offers. Compliance check passed.',
  'New pixel integration required for next campaign. Follow up next week.',
  'Traffic quality improved significantly. Discussing exclusive CPL deal.',
  'Testing new creatives on TikTok. Needs technical support for postback.',
];

const dummyDescriptionOptions = [
  'Experienced affiliate marketer focused on social media traffic. Running Facebook and TikTok campaigns with strong creative testing methodology. Growing presence in the MENA region.',
  'High-volume PPC specialist with expertise in Google and Bing Ads. Consistently delivers quality FTDs across multiple GEOs with excellent conversion rates.',
  'Established media buyer with a network of niche websites. Focused on organic SEO and native advertising. Strong in Tier-1 markets.',
  'Performance-driven partner specializing in email and SMS campaigns. Has a proprietary database of opt-in users. Reliable for burst campaigns.',
  'Social media influencer and content creator transitioning into affiliate marketing. Early stage but showing promising engagement and conversion metrics.',
  'Veteran webmaster running multiple comparison and review sites. Deep expertise in iGaming verticals with loyal returning audiences.',
  'Data-driven performance marketer using programmatic buying. Advanced tracking setup and real-time optimization. Expanding into new verticals.',
];

const toClicks = (campaign) => {
  if (typeof campaign.clicks === 'number') return campaign.clicks;
  if (campaign.cr > 0) return Math.round(campaign.ftd / (campaign.cr / 100));
  return 0;
};

const computePerformance = (campaigns = []) => {
  const active = campaigns.filter((c) => c.status === 'Active').length;
  const total = campaigns.length;
  const ftdTotal = campaigns.reduce((sum, c) => sum + Number(c.ftd || 0), 0);
  const crAvg = total > 0 ? campaigns.reduce((sum, c) => sum + Number(c.cr || 0), 0) / total : 0;
  const clicksTotal = campaigns.reduce((sum, c) => sum + toClicks(c), 0);
  const spend = campaigns.reduce((sum, c) => sum + Number(c.spend || 0), 0);
  const revenue = campaigns.reduce((sum, c) => sum + Number(c.revenue || 0), 0);
  const roi = spend > 0 ? ((revenue - spend) / spend) * 100 : 0;
  const cac = ftdTotal > 0 ? spend / ftdTotal : 0;

  return {
    campaignsActive: active,
    campaignsTotal: total,
    ftdTotal,
    crAvg: Number(crAvg.toFixed(2)),
    clicksTotal,
    roi: Number(roi.toFixed(1)),
    cac: Number(cac.toFixed(2)),
  };
};

const defaultTeam = (teamId, teamName = 'Default') => ({
  id: teamId || `team_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
  name: teamName,
  trafficGeo: {
    trafficSources: ['FB'],
    geos: ['BR'],
  },
  campaigns: { items: [] },
  performance: {
    campaignsActive: 0,
    campaignsTotal: 0,
    ftdTotal: 0,
    crAvg: 0,
    clicksTotal: 0,
    roi: 0,
    cac: 0,
  },
  finance: {
    summary: { total: 0, paid: 0, debt: 0 },
    transactions: [],
  },
  links: { items: [] },
  materials: { items: [] },
});

const defaultStructured = (id) => ({
  id,
  isArchived: false,
  archivedAt: null,
  archiveReason: '',
  information: {
    name: '',
    userId: '',
    registrationDate: '',
    team: '',
    group: 'Webmaster',
    groupSubtype: 'Personal Traffic',
    agreement: 'Revshare',
    funnelStatus: 'Contacted',
    notes: '',
    category: 'Gambling',
  },
  contact: {
    telegramNick: '',
    telegramGroup: '',
  },
  teams: [],
  // Legacy flat fields kept for backward compat during migration
  trafficGeo: {
    trafficSources: ['FB'],
    geos: ['BR'],
  },
  campaigns: { items: [] },
  performance: {
    campaignsActive: 0,
    campaignsTotal: 0,
    ftdTotal: 0,
    crAvg: 0,
    clicksTotal: 0,
    roi: 0,
    cac: 0,
  },
  finance: {
    summary: { total: 0, paid: 0, debt: 0 },
    transactions: [],
  },
  links: { items: [] },
  materials: { items: [] },
  tasks: { items: [] },
  activityLog: [],
});

const appendActivity = (partnerStructured, topic, changes) => {
  const now = new Date();
  const item = {
    id: `A-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    topic,
    changes,
    time: now.toISOString(),
  };
  partnerStructured.activityLog = [item, ...(partnerStructured.activityLog || [])].slice(0, 100);
};

/** Migrate partner-level data into a default team if teams[] is missing or empty */
const migrateToTeams = (normalized) => {
  if (Array.isArray(normalized.teams) && normalized.teams.length > 0) return;
  // Build a team from existing partner-level data
  const teamName = normalized.information?.team || 'Default';
  const team = defaultTeam(undefined, teamName);
  team.trafficGeo = clone(normalized.trafficGeo || { trafficSources: ['FB'], geos: ['BR'] });
  team.campaigns = clone(normalized.campaigns || { items: [] });
  team.performance = clone(normalized.performance || {});
  team.finance = clone(
    normalized.finance || { summary: { total: 0, paid: 0, debt: 0 }, transactions: [] }
  );
  team.links = clone(normalized.links || { items: [] });
  team.materials = clone(normalized.materials || { items: [] });
  normalized.teams = [team];
};

/** Recompute partner-level aggregates from all teams */
const aggregateFromTeams = (normalized) => {
  const teams = normalized.teams || [];
  if (teams.length === 0) return;

  // Aggregate campaigns
  const allCampaigns = teams.flatMap((t) => t.campaigns?.items || []);
  normalized.campaigns = { items: allCampaigns };

  // Aggregate performance
  normalized.performance = computePerformance(allCampaigns);

  // Aggregate finance
  let fTotal = 0,
    fPaid = 0,
    fDebt = 0;
  const allTransactions = [];
  teams.forEach((t) => {
    fTotal += Number(t.finance?.summary?.total || 0);
    fPaid += Number(t.finance?.summary?.paid || 0);
    fDebt += Number(t.finance?.summary?.debt || 0);
    allTransactions.push(...(t.finance?.transactions || []));
  });
  normalized.finance = {
    summary: { total: fTotal, paid: fPaid, debt: fDebt },
    transactions: allTransactions,
  };

  // Aggregate links + materials
  normalized.links = { items: teams.flatMap((t) => t.links?.items || []) };
  normalized.materials = { items: teams.flatMap((t) => t.materials?.items || []) };

  // Aggregate trafficGeo (union of all teams)
  const allSources = [...new Set(teams.flatMap((t) => t.trafficGeo?.trafficSources || []))];
  const allGeos = [...new Set(teams.flatMap((t) => t.trafficGeo?.geos || []))];
  normalized.trafficGeo = {
    trafficSources: allSources.length ? allSources : ['FB'],
    geos: allGeos.length ? allGeos : ['BR'],
  };
};

const DUMMY_TASK_TITLES = new Set([
  'Kickoff sync with partner team',
  'Validate tracking setup',
  'Prepare creative package',
  'Launch first campaign batch',
  'Daily KPI monitoring',
  'Weekly performance report',
]);
const filterDummyTasks = (tasks) =>
  tasks.filter((t) => {
    if (t.createdAt || t.taskManagerBaseId) return true;
    const title = String(t.title || '');
    if (DUMMY_TASK_TITLES.has(title.replace(/\s*\(.*\)\s*$/, ''))) return false;
    return true;
  });

const normalizePartner = (raw) => {
  // New structured shape already
  if (raw && raw.information && raw.contact) {
    const normalized = clone(raw);
    normalized.isArchived = Boolean(normalized.isArchived);
    normalized.archivedAt = normalized.archivedAt || null;
    normalized.archiveReason = normalized.archiveReason || '';
    normalized.campaigns = normalized.campaigns || { items: [] };
    normalized.links = normalized.links || { items: [] };
    normalized.materials = normalized.materials || { items: [] };
    normalized.tasks = normalized.tasks || { items: [] };
    normalized.finance = normalized.finance || {
      summary: { total: 0, paid: 0, debt: 0 },
      transactions: [],
    };
    normalized.activityLog = normalized.activityLog || [];
    normalized.tasks.items = Array.isArray(normalized.tasks.items) ? normalized.tasks.items : [];
    normalized.tasks.items = filterDummyTasks(normalized.tasks.items);
    normalized.trafficGeo = normalized.trafficGeo || { trafficSources: ['FB'], geos: ['BR'] };
    normalized.performance = {
      ...(normalized.performance || {}),
      ...computePerformance(normalized.campaigns.items || []),
    };
    normalized.teams = normalized.teams || [];
    normalized.information.category = normalized.information.category || 'Gambling';
    migrateToTeams(normalized);
    aggregateFromTeams(normalized);
    return normalized;
  }

  // Legacy flat shape -> topic structure
  const base = defaultStructured(raw.id);
  base.information = {
    name: raw.name || '',
    userId: raw.userId || '',
    registrationDate: raw.registrationDate || '',
    team: raw.team || '',
    group: raw.group || 'Webmaster',
    groupSubtype: raw.groupSubtype || (raw.group === 'Partner' ? 'Our DB' : 'Personal Traffic'),
    agreement: raw.agreement || 'Revshare',
    funnelStatus: raw.funnelStatus || 'Contacted',
    notes: raw.notes || '',
    description: raw.description || '',
    category: raw.category || 'Gambling',
  };
  base.contact = {
    telegramNick: raw.telegramNick || '',
    telegramGroup: raw.telegramGroup || '',
  };
  base.trafficGeo = {
    trafficSources:
      Array.isArray(raw.trafficSources) && raw.trafficSources.length
        ? raw.trafficSources
        : [raw.trafficSource || 'FB'],
    geos: Array.isArray(raw.geos) && raw.geos.length ? raw.geos : [raw.geo || 'BR'],
  };
  base.campaigns = { items: Array.isArray(raw.campaigns) ? raw.campaigns : [] };
  base.performance = {
    ...computePerformance(base.campaigns.items),
    campaignsActive: Number(
      raw.campaignsActive ?? computePerformance(base.campaigns.items).campaignsActive
    ),
    campaignsTotal: Number(
      raw.campaignsTotal ?? computePerformance(base.campaigns.items).campaignsTotal
    ),
    ftdTotal: Number(raw.ftdTotal ?? computePerformance(base.campaigns.items).ftdTotal),
    crAvg: Number(raw.crAvg ?? computePerformance(base.campaigns.items).crAvg),
    clicksTotal: Number(raw.clicksTotal ?? computePerformance(base.campaigns.items).clicksTotal),
    roi: Number(raw.roi ?? computePerformance(base.campaigns.items).roi),
    cac: Number(raw.cac ?? computePerformance(base.campaigns.items).cac),
  };
  const txList = Array.isArray(raw.financeTransactions) ? raw.financeTransactions : [];
  const financeTotal = Number(raw.finance?.total ?? 0);
  const financePaid = Number(raw.finance?.paid ?? 0);
  const financeDebt = Number(raw.finance?.debt ?? 0);
  base.finance = {
    summary: { total: financeTotal, paid: financePaid, debt: financeDebt },
    transactions: txList,
  };
  base.links = { items: Array.isArray(raw.links) ? raw.links : [] };
  base.materials = { items: Array.isArray(raw.materials) ? raw.materials : [] };
  base.materials.items = [];
  const rawTasks = Array.isArray(raw.tasks) ? raw.tasks : [];
  base.tasks = { items: filterDummyTasks(rawTasks) };
  base.activityLog = Array.isArray(raw.activityLog) ? raw.activityLog : [];
  return base;
};

const projectPartner = (partnerStructured) => {
  const performance = {
    ...computePerformance(partnerStructured.campaigns.items || []),
    ...(partnerStructured.performance || {}),
  };
  const total = Number(partnerStructured.finance?.summary?.total || 0);
  const paid = Number(partnerStructured.finance?.summary?.paid || 0);
  const debt = Number(partnerStructured.finance?.summary?.debt || 0);

  return {
    id: partnerStructured.id,
    createdAt: partnerStructured.createdAt ?? null,
    updatedAt: partnerStructured.updatedAt ?? null,
    createdBy: partnerStructured.createdBy ?? null,
    isArchived: Boolean(partnerStructured.isArchived),
    archivedAt: partnerStructured.archivedAt ?? null,
    archiveReason: partnerStructured.archiveReason ?? '',

    // Topic blocks (new structure)
    information: clone(partnerStructured.information),
    contact: clone(partnerStructured.contact),
    teams: clone(partnerStructured.teams || []),
    trafficGeo: clone(partnerStructured.trafficGeo),
    campaignsTopic: clone(partnerStructured.campaigns),
    performanceTopic: clone(partnerStructured.performance),
    financeTopic: clone(partnerStructured.finance),
    linksTopic: clone(partnerStructured.links),
    materialsTopic: clone(partnerStructured.materials),
    tasksTopic: clone(partnerStructured.tasks),
    activityLog: clone(partnerStructured.activityLog || []),

    // Flat compatibility projection for existing UI
    name: partnerStructured.information.name,
    userId: partnerStructured.information.userId,
    registrationDate: partnerStructured.information.registrationDate,
    team: partnerStructured.information.team,
    group: partnerStructured.information.group,
    groupSubtype: partnerStructured.information.groupSubtype,
    agreement: partnerStructured.information.agreement,
    funnelStatus: partnerStructured.information.funnelStatus,
    notes: partnerStructured.information.notes,
    description: partnerStructured.information.description || '',
    category: partnerStructured.information.category || 'Gambling',

    telegramNick: partnerStructured.contact.telegramNick,
    telegramGroup: partnerStructured.contact.telegramGroup,

    trafficSources: clone(partnerStructured.trafficGeo.trafficSources || []),
    trafficSource: (partnerStructured.trafficGeo.trafficSources || [])[0] || 'FB',
    geos: clone(partnerStructured.trafficGeo.geos || []),
    geo: (partnerStructured.trafficGeo.geos || [])[0] || 'BR',

    campaigns: clone(partnerStructured.campaigns.items || []),
    campaignsActive: performance.campaignsActive,
    campaignsTotal: performance.campaignsTotal,
    ftdTotal: performance.ftdTotal,
    crAvg: performance.crAvg,
    clicksTotal: performance.clicksTotal,
    roi: performance.roi,
    cac: performance.cac,

    finance: { total, paid, debt },
    financeTransactions: clone(partnerStructured.finance.transactions || []),
    currentBalance: total,

    links: clone(partnerStructured.links.items || []),
    materials: clone(partnerStructured.materials.items || []),
    tasks: clone(partnerStructured.tasks.items || []),
  };
};

const applyLegacyUpdates = (partnerStructured, data) => {
  if (data.isArchived !== undefined) partnerStructured.isArchived = Boolean(data.isArchived);
  if (data.archivedAt !== undefined) partnerStructured.archivedAt = data.archivedAt || null;
  if (data.archiveReason !== undefined) partnerStructured.archiveReason = data.archiveReason || '';

  // Teams update (apply early so subsequent field syncs use the latest teams array).
  // This matters because callers (e.g. PartnerDetail "Edit Fields") often send both
  // `teams` and partner-level `geos/trafficSources`. If we apply traffic/geo first
  // and then overwrite `teams`, we effectively revert the trafficGeo change.
  if (data.teams !== undefined) {
    partnerStructured.teams = Array.isArray(data.teams) ? data.teams : [];
  }

  // Information
  if (data.name !== undefined) partnerStructured.information.name = data.name;
  if (data.userId !== undefined) partnerStructured.information.userId = data.userId;
  if (data.registrationDate !== undefined)
    partnerStructured.information.registrationDate = data.registrationDate;
  if (data.team !== undefined) partnerStructured.information.team = data.team;
  if (data.group !== undefined) partnerStructured.information.group = data.group;
  if (data.groupSubtype !== undefined)
    partnerStructured.information.groupSubtype = data.groupSubtype;
  if (data.agreement !== undefined) partnerStructured.information.agreement = data.agreement;
  if (data.funnelStatus !== undefined)
    partnerStructured.information.funnelStatus = data.funnelStatus;
  if (data.notes !== undefined) partnerStructured.information.notes = data.notes;
  if (data.description !== undefined) partnerStructured.information.description = data.description;
  if (data.category !== undefined) partnerStructured.information.category = data.category;

  // Contact
  if (data.telegramNick !== undefined) partnerStructured.contact.telegramNick = data.telegramNick;
  if (data.telegramGroup !== undefined)
    partnerStructured.contact.telegramGroup = data.telegramGroup;

  // Traffic + geo — keep partner-level and all teams in sync so aggregateFromTeams doesn't overwrite on next load
  if (data.trafficSources !== undefined) {
    const sources = Array.isArray(data.trafficSources)
      ? data.trafficSources
      : [data.trafficSources].filter(Boolean);
    partnerStructured.trafficGeo.trafficSources = sources;
    (partnerStructured.teams || []).forEach((t) => {
      if (!t.trafficGeo) t.trafficGeo = { trafficSources: ['FB'], geos: ['BR'] };
      t.trafficGeo.trafficSources = sources;
    });
  }
  if (data.trafficSource !== undefined && data.trafficSources === undefined) {
    const sources = [data.trafficSource].filter(Boolean);
    partnerStructured.trafficGeo.trafficSources = sources;
    (partnerStructured.teams || []).forEach((t) => {
      if (!t.trafficGeo) t.trafficGeo = { trafficSources: ['FB'], geos: ['BR'] };
      t.trafficGeo.trafficSources = sources;
    });
  }
  if (data.geos !== undefined) {
    const geos = Array.isArray(data.geos) ? data.geos : [data.geos].filter(Boolean);
    partnerStructured.trafficGeo.geos = geos;
    (partnerStructured.teams || []).forEach((t) => {
      if (!t.trafficGeo) t.trafficGeo = { trafficSources: ['FB'], geos: ['BR'] };
      t.trafficGeo.geos = geos;
    });
  }
  if (data.geo !== undefined && data.geos === undefined) {
    const geos = [data.geo].filter(Boolean);
    partnerStructured.trafficGeo.geos = geos;
    (partnerStructured.teams || []).forEach((t) => {
      if (!t.trafficGeo) t.trafficGeo = { trafficSources: ['FB'], geos: ['BR'] };
      t.trafficGeo.geos = geos;
    });
  }

  // Campaigns + performance
  if (data.campaigns !== undefined) {
    partnerStructured.campaigns.items = Array.isArray(data.campaigns) ? data.campaigns : [];
  }
  if (
    data.campaignsActive !== undefined ||
    data.campaignsTotal !== undefined ||
    data.ftdTotal !== undefined ||
    data.crAvg !== undefined ||
    data.clicksTotal !== undefined ||
    data.roi !== undefined ||
    data.cac !== undefined
  ) {
    partnerStructured.performance = {
      ...partnerStructured.performance,
      ...(data.campaignsActive !== undefined
        ? { campaignsActive: Number(data.campaignsActive) }
        : {}),
      ...(data.campaignsTotal !== undefined ? { campaignsTotal: Number(data.campaignsTotal) } : {}),
      ...(data.ftdTotal !== undefined ? { ftdTotal: Number(data.ftdTotal) } : {}),
      ...(data.crAvg !== undefined ? { crAvg: Number(data.crAvg) } : {}),
      ...(data.clicksTotal !== undefined ? { clicksTotal: Number(data.clicksTotal) } : {}),
      ...(data.roi !== undefined ? { roi: Number(data.roi) } : {}),
      ...(data.cac !== undefined ? { cac: Number(data.cac) } : {}),
    };
  }

  // Finance
  if (data.finance !== undefined) {
    partnerStructured.finance.summary = {
      ...partnerStructured.finance.summary,
      ...data.finance,
    };
  }
  if (data.currentBalance !== undefined) {
    partnerStructured.finance.summary.total = Number(data.currentBalance || 0);
    if (!data.finance?.paid && !data.finance?.debt) {
      const paid = Number(partnerStructured.finance.summary.paid || 0);
      partnerStructured.finance.summary.debt = Math.max(0, Number(data.currentBalance || 0) - paid);
    }
  }
  if (data.financeTransactions !== undefined) {
    const txList = Array.isArray(data.financeTransactions) ? data.financeTransactions : [];
    partnerStructured.finance.transactions = txList;
    // Also sync transactions to the first team so aggregateFromTeams picks them up
    if (Array.isArray(partnerStructured.teams) && partnerStructured.teams.length > 0) {
      partnerStructured.teams[0].finance = partnerStructured.teams[0].finance || {
        summary: { total: 0, paid: 0, debt: 0 },
        transactions: [],
      };
      partnerStructured.teams[0].finance.transactions = txList;
    }
  }
  if (
    data.finance !== undefined &&
    Array.isArray(partnerStructured.teams) &&
    partnerStructured.teams.length > 0
  ) {
    partnerStructured.teams[0].finance = partnerStructured.teams[0].finance || {
      summary: { total: 0, paid: 0, debt: 0 },
      transactions: [],
    };
    partnerStructured.teams[0].finance.summary = {
      ...partnerStructured.teams[0].finance.summary,
      ...data.finance,
    };
  }

  // Links + materials + tasks — also sync to first team so aggregateFromTeams preserves them
  if (data.links !== undefined) {
    const linksList = Array.isArray(data.links) ? data.links : [];
    partnerStructured.links.items = linksList;
    if (Array.isArray(partnerStructured.teams) && partnerStructured.teams.length > 0) {
      partnerStructured.teams[0].links = partnerStructured.teams[0].links || { items: [] };
      partnerStructured.teams[0].links.items = linksList;
    }
  }
  if (data.materials !== undefined) {
    const matList = Array.isArray(data.materials) ? data.materials : [];
    partnerStructured.materials.items = matList;
    if (Array.isArray(partnerStructured.teams) && partnerStructured.teams.length > 0) {
      partnerStructured.teams[0].materials = partnerStructured.teams[0].materials || { items: [] };
      partnerStructured.teams[0].materials.items = matList;
    }
  }
  if (data.tasks !== undefined) {
    partnerStructured.tasks.items = Array.isArray(data.tasks) ? data.tasks : [];
  }

  // Reaggregate from teams and recompute performance
  aggregateFromTeams(partnerStructured);
  partnerStructured.performance = {
    ...computePerformance(partnerStructured.campaigns.items),
    ...partnerStructured.performance,
  };
};

const loadPartnersLocal = () => {
  const fallback = clone(partnersData);
  if (!canUseStorage()) return fallback;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
};

const savePartnersLocal = (nextPartnersStructured) => {
  if (!canUseStorage()) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(nextPartnersStructured));
  } catch {
    // Ignore local persistence failures (quota/private mode).
  }
};

let partners = loadPartnersLocal().map(normalizePartner);

export const partnerService = {
  async getAll() {
    await delay();
    if (hasSupabase()) {
      const raw = await loadPartnersBackend();
      const normalized = raw.map(normalizePartner);
      return clone(normalized.filter((p) => !p.isArchived).map(projectPartner));
    }
    return clone(partners.filter((p) => !p.isArchived).map(projectPartner));
  },

  async getById(id) {
    await delay();
    if (hasSupabase()) {
      const raw = await loadPartnersBackend();
      const normalized = raw.map(normalizePartner);
      const partner = normalized.find((p) => p.id === id);
      if (!partner) throw new Error(`Partner ${id} not found`);
      return clone(projectPartner(partner));
    }
    const partner = partners.find((p) => p.id === id);
    if (!partner) throw new Error(`Partner ${id} not found`);
    return clone(projectPartner(partner));
  },

  async create(data, agentContext = null) {
    await delay();
    const raw = hasSupabase() ? await loadPartnersBackend() : partners;
    const id = hasSupabase()
      ? await getNextPartnerId(raw.length)
      : `P-${String(raw.length + 1).padStart(3, '0')}`;
    const now = new Date().toISOString();
    const created = defaultStructured(id);
    created.information.userId = `USR-${Math.floor(10000 + Math.random() * 90000)}`;
    created.information.registrationDate = now.split('T')[0];
    created.createdAt = now;
    created.updatedAt = now;
    applyLegacyUpdates(created, data);
    // Create initial team from the team name if provided and no teams exist yet
    if ((!created.teams || created.teams.length === 0) && created.information.team) {
      const team = defaultTeam(undefined, created.information.team);
      team.trafficGeo = clone(created.trafficGeo);
      created.teams = [team];
      aggregateFromTeams(created);
    }
    appendActivity(created, 'Information', 'Partner created');
    if (hasSupabase()) {
      const all = raw.map(normalizePartner);
      all.unshift(created);
      await savePartnersBackend(all);
      logAction({
        action: 'Partner created',
        entity: 'Partner',
        entityId: id,
        details: created.information?.name ? `New partner: ${created.information.name}` : null,
        meta: {
          source: 'partnerService',
          importance: 'medium',
          tags: ['create', 'partner'],
          ...buildAgentMeta(agentContext),
          codeAfter: JSON.stringify(
            {
              id: created.id,
              name: created.information?.name || '',
              status: created.information?.status || '',
              team: created.information?.team || '',
            },
            null,
            2
          ),
        },
      });
      maybeNotify('partner_created', {
        name: created.information?.name || id,
        funnelStatus: created.information?.status || '',
        group: created.information?.team || '',
        notes: created.information?.notes || '',
      });
    } else {
      partners = [created, ...partners];
      savePartnersLocal(partners);
    }
    return clone(projectPartner(created));
  },

  async update(id, data, agentContext = null) {
    await delay();
    if (hasSupabase()) {
      const raw = await loadPartnersBackend();
      const normalized = raw.map(normalizePartner);
      const idx = normalized.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Partner ${id} not found`);
      applyLegacyUpdates(normalized[idx], data);
      const changedSummary = Object.entries(data)
        .filter(([k]) => !['geo', 'trafficSource', 'groupSubtype'].includes(k))
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
        .join('; ');
      appendActivity(
        normalized[idx],
        'Update',
        changedSummary || `changed ${Object.keys(data).join(', ')}`
      );
      await savePartnersBackend(normalized);
      logAction({
        action: 'Partner updated',
        entity: 'Partner',
        entityId: id,
        details: Object.keys(data).join(', '),
        meta: {
          source: 'partnerService',
          importance: 'medium',
          tags: ['update', 'partner'],
          ...buildAgentMeta(agentContext),
          codeAfter: JSON.stringify(
            {
              id: normalized[idx].id,
              changedFields: Object.keys(data),
              name: normalized[idx].information?.name || '',
              status: normalized[idx].information?.status || '',
            },
            null,
            2
          ),
        },
      });
      maybeNotify('partner_updated', {
        name: normalized[idx].information?.name || id,
        changedFields: Object.keys(data).join(', '),
      });
      return clone(projectPartner(normalized[idx]));
    }
    const idx = partners.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Partner ${id} not found`);
    applyLegacyUpdates(partners[idx], data);
    const changedSummaryLocal = Object.entries(data)
      .filter(([k]) => !['geo', 'trafficSource', 'groupSubtype'].includes(k))
      .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(', ') : v}`)
      .join('; ');
    appendActivity(
      partners[idx],
      'Update',
      changedSummaryLocal || `changed ${Object.keys(data).join(', ')}`
    );
    savePartnersLocal(partners);
    return clone(projectPartner(partners[idx]));
  },

  async archive(id, reason = '', agentContext = null) {
    await delay();
    const archiveAt = new Date().toISOString();
    const archiveReason = String(reason || '').trim();
    if (hasSupabase()) {
      const raw = await loadPartnersBackend();
      const normalized = raw.map(normalizePartner);
      const idx = normalized.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Partner ${id} not found`);
      normalized[idx].isArchived = true;
      normalized[idx].archivedAt = archiveAt;
      normalized[idx].archiveReason = archiveReason || 'Archived from Partners page';
      appendActivity(
        normalized[idx],
        'Governance',
        `Partner archived${archiveReason ? `: ${archiveReason}` : ''}`
      );
      await savePartnersBackend(normalized);
      logAction({
        action: 'Partner archived',
        entity: 'Partner',
        entityId: id,
        details: normalized[idx].information?.name || id,
        meta: {
          source: 'partnerService',
          importance: 'high',
          tags: ['archive', 'partner'],
          ...buildAgentMeta(agentContext),
          archiveReason: normalized[idx].archiveReason,
          archivedAt: archiveAt,
        },
      });
      maybeNotify('partner_archived', {
        name: normalized[idx].information?.name || id,
        reason: normalized[idx].archiveReason || '',
      });
      return clone(projectPartner(normalized[idx]));
    }
    const idx = partners.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Partner ${id} not found`);
    partners[idx].isArchived = true;
    partners[idx].archivedAt = archiveAt;
    partners[idx].archiveReason = archiveReason || 'Archived from Partners page';
    appendActivity(
      partners[idx],
      'Governance',
      `Partner archived${archiveReason ? `: ${archiveReason}` : ''}`
    );
    savePartnersLocal(partners);
    return clone(projectPartner(partners[idx]));
  },

  async updateTasks(id, tasks, agentContext = null) {
    await delay();
    if (hasSupabase()) {
      const raw = await loadPartnersBackend();
      const normalized = raw.map(normalizePartner);
      const idx = normalized.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Partner ${id} not found`);
      normalized[idx].tasks.items = Array.isArray(tasks) ? tasks : [];
      appendActivity(normalized[idx], 'Task Manager', 'Tasks updated');
      await savePartnersBackend(normalized);
      logAction({
        action: 'Tasks updated',
        entity: 'Task',
        entityId: id,
        details: `${(tasks || []).length} task(s) · P-${id}`,
        meta: buildAgentMeta(agentContext),
      });
      const result = clone(projectPartner(normalized[idx]));
      window.dispatchEvent(new Event('orch-partners-invalidated'));
      return result;
    }
    const idx = partners.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Partner ${id} not found`);
    partners[idx].tasks.items = Array.isArray(tasks) ? tasks : [];
    appendActivity(partners[idx], 'Task Manager', 'Tasks updated');
    savePartnersLocal(partners);
    const result = clone(projectPartner(partners[idx]));
    window.dispatchEvent(new Event('orch-partners-invalidated'));
    return result;
  },

  /** Clear tasks for all partners (Task Manager + partner pages). */
  async clearAllTasks(agentContext = null) {
    await delay();
    if (hasSupabase()) {
      const raw = await loadPartnersBackend();
      const normalized = raw.map(normalizePartner);
      normalized.forEach((p) => {
        p.tasks.items = [];
        appendActivity(p, 'Task Manager', 'All tasks cleared');
      });
      await savePartnersBackend(normalized);
      logAction({
        action: 'Tasks cleared',
        entity: 'Task',
        entityId: '—',
        details: 'All tasks cleared across partners',
        meta: buildAgentMeta(agentContext),
      });
      window.dispatchEvent(new Event('orch-partners-invalidated'));
      return normalized.length;
    }
    partners.forEach((p) => {
      p.tasks.items = [];
      appendActivity(p, 'Task Manager', 'All tasks cleared');
    });
    savePartnersLocal(partners);
    window.dispatchEvent(new Event('orch-partners-invalidated'));
    return partners.length;
  },

  async addMaterial(id, material, agentContext = null) {
    await delay();
    if (hasSupabase()) {
      const raw = await loadPartnersBackend();
      const normalized = raw.map(normalizePartner);
      const idx = normalized.findIndex((p) => p.id === id);
      if (idx === -1) throw new Error(`Partner ${id} not found`);
      const newMaterial = {
        ...material,
        id: `M-${Math.floor(100 + Math.random() * 900)}`,
        uploadedAt: new Date().toISOString().split('T')[0],
      };
      normalized[idx].materials.items = [newMaterial, ...normalized[idx].materials.items];
      appendActivity(normalized[idx], 'Materials', `changed to ${newMaterial.name}`);
      await savePartnersBackend(normalized);
      logAction({
        action: 'Material added',
        entity: 'Partner',
        entityId: id,
        details: newMaterial.name,
        meta: buildAgentMeta(agentContext),
      });
      return clone(newMaterial);
    }
    const idx = partners.findIndex((p) => p.id === id);
    if (idx === -1) throw new Error(`Partner ${id} not found`);
    const newMaterial = {
      ...material,
      id: `M-${Math.floor(100 + Math.random() * 900)}`,
      uploadedAt: new Date().toISOString().split('T')[0],
    };
    partners[idx].materials.items = [newMaterial, ...partners[idx].materials.items];
    appendActivity(partners[idx], 'Materials', `changed to ${newMaterial.name}`);
    savePartnersLocal(partners);
    return clone(newMaterial);
  },

  /**
   * Create tasks in Task Manager from a completed meeting's structured transcript.
   * Uses action_items (and optionally decisions) to fill task title, assignee, description, deadline.
   */
  async createTasksFromMeeting(partnerId, meeting) {
    await delay(100);
    const structured = meeting?.transcriptStructured;
    if (!structured || !partnerId) return null;

    const partner = await this.getById(partnerId);
    const userId = partner.userId || '';
    const existingTasks = Array.isArray(partner.tasks) ? partner.tasks : [];
    const meetingIdShort = (meeting.id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-6) || 'mtg';
    const newTasks = [];
    const normalizeTaskTitle = (value) =>
      String(value || '')
        .trim()
        .toLowerCase();
    const hasDuplicateTitle = (title) => {
      const normalized = normalizeTaskTitle(title);
      if (!normalized) return false;
      return (
        existingTasks.some((t) => normalizeTaskTitle(t.title) === normalized) ||
        newTasks.some((t) => normalizeTaskTitle(t.title) === normalized)
      );
    };

    const parseDeadline = (text) => {
      if (!text || typeof text !== 'string') return addDays(7);
      const lower = text.toLowerCase();
      if (lower.includes('tomorrow')) return addDays(1);
      if (lower.includes('end of week') || lower.includes('eow')) return addDays(5);
      if (lower.includes('next week')) return addDays(7);
      if (lower.includes('monday')) {
        const d = new Date();
        let days = 1 - d.getDay();
        if (days <= 0) days += 7;
        return addDays(days);
      }
      const iso = text.match(/\d{4}-\d{2}-\d{2}/);
      if (iso) return iso[0];
      const d = new Date(text);
      if (!Number.isNaN(d.getTime())) return toDateInput(d);
      return addDays(7);
    };

    // Action items → tasks (high priority, todo)
    const actionItems = structured.action_items || [];
    const now = new Date().toISOString();
    actionItems.forEach((item, i) => {
      const title = (item.task || 'Action item').slice(0, 200);
      if (hasDuplicateTitle(title)) return;
      const taskId = `T-${partnerId}-MTG-${meetingIdShort}-${String(i + 1).padStart(2, '0')}`;
      newTasks.push({
        id: taskId,
        taskId,
        userId,
        title,
        status: 'todo',
        priority: 'high',
        assignedTo: item.assignee || 'Unassigned',
        estimate: '',
        createdAt: now,
        createdBy: null, // Could inject from auth if available
        description: [
          meeting.title ? `From meeting: ${meeting.title}` : 'From meeting',
          meeting.datetime ? `Meeting date: ${new Date(meeting.datetime).toLocaleString()}` : '',
          item.deadline ? `Requested: ${item.deadline}` : '',
          structured.summary ? `Context: ${structured.summary.slice(0, 200)}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        deadline: parseDeadline(item.deadline),
      });
    });

    // Extracted requests → tasks (medium priority) if present
    const extractedRequests = Array.isArray(structured.extracted_requests)
      ? structured.extracted_requests
      : [];
    extractedRequests.forEach((req, i) => {
      const title = (req?.title || req?.description || '').trim();
      if (!title) return;
      if (hasDuplicateTitle(title)) return;
      const taskId = `T-${partnerId}-MTG-${meetingIdShort}-R${String(i + 1).padStart(2, '0')}`;
      newTasks.push({
        id: taskId,
        taskId,
        userId,
        title: title.slice(0, 200),
        status: 'todo',
        priority: req?.priority === 'high' ? 'high' : 'medium',
        assignedTo: req?.owner || 'Unassigned',
        estimate: '',
        createdAt: new Date().toISOString(),
        createdBy: null,
        description: [
          req?.description || '',
          Array.isArray(req?.required_resources) && req.required_resources.length
            ? `Resources: ${req.required_resources.join(', ')}`
            : '',
          req?.context ? `Context: ${req.context}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        deadline: parseDeadline(req?.deadline || req?.due || ''),
      });
    });

    // Recommended actions → tasks (mapped from LLM one-click suggestions)
    const highPriorityActionTypes = new Set([
      'grant_permission',
      'launch_project',
      'update_workflow',
    ]);
    const recommendedActions = Array.isArray(structured.recommended_actions)
      ? structured.recommended_actions
      : [];
    recommendedActions.forEach((action, i) => {
      const title = String(action?.title || action?.description || '').trim();
      if (!title) return;
      if (hasDuplicateTitle(title)) return;
      const taskId = `T-${partnerId}-MTG-${meetingIdShort}-A${String(i + 1).padStart(2, '0')}`;
      const payload = action?.payload && typeof action.payload === 'object' ? action.payload : null;
      const payloadSummary = payload
        ? Object.entries(payload)
            .filter(([, v]) => v !== null && v !== undefined && String(v).trim() !== '')
            .map(([k, v]) => `${k}: ${v}`)
        : [];
      const actionType = String(action?.action_type || '').trim();
      newTasks.push({
        id: taskId,
        taskId,
        userId,
        title: title.slice(0, 200),
        status: 'todo',
        priority: highPriorityActionTypes.has(actionType) ? 'high' : 'medium',
        assignedTo: structured.organizer || 'Unassigned',
        estimate: '',
        createdAt: new Date().toISOString(),
        createdBy: null,
        description: [
          action?.description || '',
          actionType ? `Action type: ${actionType}` : '',
          action?.context ? `Context: ${action.context}` : '',
          payloadSummary.length > 0 ? `Payload:\n${payloadSummary.join('\n')}` : '',
          meeting.title ? `From meeting: ${meeting.title}` : 'From meeting',
        ]
          .filter(Boolean)
          .join('\n'),
        deadline: addDays(highPriorityActionTypes.has(actionType) ? 3 : 7),
      });
    });

    // Materials/info mentions → tasks (e.g. "provide details", links, docs, assets).
    const materialsRequested = Array.isArray(structured.materials_requested)
      ? structured.materials_requested
      : [];
    materialsRequested.forEach((item, i) => {
      const title = `Provide requested materials: ${String(item || '').trim()}`.trim();
      if (!item || hasDuplicateTitle(title)) return;
      const taskId = `T-${partnerId}-MTG-${meetingIdShort}-M${String(i + 1).padStart(2, '0')}`;
      newTasks.push({
        id: taskId,
        taskId,
        userId,
        title: title.slice(0, 200),
        status: 'todo',
        priority: 'medium',
        assignedTo: structured.organizer || 'Unassigned',
        estimate: '',
        createdAt: new Date().toISOString(),
        createdBy: null,
        description: [
          `Requested item: ${item}`,
          meeting.title ? `From meeting: ${meeting.title}` : 'From meeting',
          structured.summary ? `Context: ${structured.summary.slice(0, 200)}` : '',
        ]
          .filter(Boolean)
          .join('\n'),
        deadline: addDays(7),
      });
    });

    // Decisions → single follow-up task (medium priority) if we have decisions and no action items
    const decisions = structured.decisions || [];
    if (decisions.length > 0 && newTasks.length === 0) {
      const taskId = `T-${partnerId}-MTG-${meetingIdShort}-D`;
      const now2 = new Date().toISOString();
      newTasks.push({
        id: taskId,
        taskId,
        userId,
        title: `Follow up on decisions: ${(meeting.title || 'Meeting').slice(0, 80)}`,
        createdAt: now2,
        createdBy: null,
        status: 'todo',
        priority: 'medium',
        assignedTo: structured.organizer || 'Unassigned',
        estimate: '',
        description: `Decisions made:\n${decisions.map((d) => `• ${d}`).join('\n')}\n\nFrom meeting: ${meeting.title || 'Meeting'}`,
        deadline: addDays(7),
      });
    } else if (decisions.length > 0) {
      const taskId = `T-${partnerId}-MTG-${meetingIdShort}-DEC`;
      const now3 = new Date().toISOString();
      newTasks.push({
        id: taskId,
        taskId,
        userId,
        title: `Track decisions: ${decisions.length} item(s)`,
        createdAt: now3,
        createdBy: null,
        status: 'todo',
        priority: 'medium',
        assignedTo: structured.organizer || 'Unassigned',
        estimate: '',
        description: decisions.map((d) => `• ${d}`).join('\n'),
        deadline: addDays(14),
      });
    }

    if (newTasks.length === 0) return clone(partner);

    const enrichedTasks = newTasks.map((t) => ({
      ...t,
      partnerId,
      taskManagerBaseId:
        t.taskManagerBaseId || `TMB-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    }));
    const merged = [...existingTasks, ...enrichedTasks];
    return this.updateTasks(partnerId, merged);
  },

  /* ---- Team management ---- */

  async addTeam(partnerId, teamData, agentContext = null) {
    await delay();
    const team = defaultTeam(undefined, teamData.name || 'New Team');
    if (teamData.trafficGeo) team.trafficGeo = teamData.trafficGeo;

    if (hasSupabase()) {
      const raw = await loadPartnersBackend();
      const normalized = raw.map(normalizePartner);
      const idx = normalized.findIndex((p) => p.id === partnerId);
      if (idx === -1) throw new Error(`Partner ${partnerId} not found`);
      normalized[idx].teams.push(team);
      aggregateFromTeams(normalized[idx]);
      appendActivity(normalized[idx], 'Teams', `Team "${team.name}" added`);
      await savePartnersBackend(normalized);
      logAction({
        action: 'Team added',
        entity: 'Partner',
        entityId: partnerId,
        details: `Team: ${team.name}`,
        meta: buildAgentMeta(agentContext),
      });
      return clone(projectPartner(normalized[idx]));
    }
    const idx = partners.findIndex((p) => p.id === partnerId);
    if (idx === -1) throw new Error(`Partner ${partnerId} not found`);
    partners[idx].teams.push(team);
    aggregateFromTeams(partners[idx]);
    appendActivity(partners[idx], 'Teams', `Team "${team.name}" added`);
    savePartnersLocal(partners);
    return clone(projectPartner(partners[idx]));
  },

  async updateTeam(partnerId, teamId, teamData) {
    await delay();
    const updateFn = (partner) => {
      const team = partner.teams.find((t) => t.id === teamId);
      if (!team) throw new Error(`Team ${teamId} not found`);
      if (teamData.name !== undefined) team.name = teamData.name;
      if (teamData.trafficGeo !== undefined) team.trafficGeo = teamData.trafficGeo;
      if (teamData.campaigns !== undefined) team.campaigns = teamData.campaigns;
      if (teamData.finance !== undefined) team.finance = teamData.finance;
      if (teamData.links !== undefined) team.links = teamData.links;
      if (teamData.materials !== undefined) team.materials = teamData.materials;
      // Recompute team performance
      team.performance = computePerformance(team.campaigns?.items || []);
      aggregateFromTeams(partner);
      appendActivity(partner, 'Teams', `Team "${team.name}" updated`);
    };

    if (hasSupabase()) {
      const raw = await loadPartnersBackend();
      const normalized = raw.map(normalizePartner);
      const idx = normalized.findIndex((p) => p.id === partnerId);
      if (idx === -1) throw new Error(`Partner ${partnerId} not found`);
      updateFn(normalized[idx]);
      await savePartnersBackend(normalized);
      return clone(projectPartner(normalized[idx]));
    }
    const idx = partners.findIndex((p) => p.id === partnerId);
    if (idx === -1) throw new Error(`Partner ${partnerId} not found`);
    updateFn(partners[idx]);
    savePartnersLocal(partners);
    return clone(projectPartner(partners[idx]));
  },

  async removeTeam(partnerId, teamId) {
    await delay();
    if (hasSupabase()) {
      const raw = await loadPartnersBackend();
      const normalized = raw.map(normalizePartner);
      const idx = normalized.findIndex((p) => p.id === partnerId);
      if (idx === -1) throw new Error(`Partner ${partnerId} not found`);
      const teamName = normalized[idx].teams.find((t) => t.id === teamId)?.name || 'Unknown';
      normalized[idx].teams = normalized[idx].teams.filter((t) => t.id !== teamId);
      aggregateFromTeams(normalized[idx]);
      appendActivity(normalized[idx], 'Teams', `Team "${teamName}" removed`);
      await savePartnersBackend(normalized);
      return clone(projectPartner(normalized[idx]));
    }
    const idx = partners.findIndex((p) => p.id === partnerId);
    if (idx === -1) throw new Error(`Partner ${partnerId} not found`);
    const teamName = partners[idx].teams.find((t) => t.id === teamId)?.name || 'Unknown';
    partners[idx].teams = partners[idx].teams.filter((t) => t.id !== teamId);
    aggregateFromTeams(partners[idx]);
    appendActivity(partners[idx], 'Teams', `Team "${teamName}" removed`);
    savePartnersLocal(partners);
    return clone(projectPartner(partners[idx]));
  },
};
