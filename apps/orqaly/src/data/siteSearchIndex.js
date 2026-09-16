import { GROUPS, INSTRUMENTS } from './instruments';
import { PERSONAS } from './personas';
import { getSolutionPageData } from './solutions';
import { WORKFLOW_SEARCH_TEXT } from './workflowPage';
import { TASK_MANAGER_SEARCH_TEXT } from './taskManagerPage';
import { PROJECTS_SEARCH_TEXT } from './projectsPage';
import { FAQ_QUESTIONS } from '../pages/Landing/data/faq';

const INSTRUMENT_HUB_SEARCH = {
  workflow: WORKFLOW_SEARCH_TEXT,
  'task-manager': TASK_MANAGER_SEARCH_TEXT,
  projects: PROJECTS_SEARCH_TEXT,
};

function joinParts(parts) {
  return parts.filter(Boolean).join(' ');
}

function instrumentEntry(item) {
  const category = item.group === 'instruments' ? GROUPS.instruments.label : GROUPS.control.label;
  const path = `/${item.group === 'instruments' ? 'instruments' : 'control'}/${item.slug}`;
  const text = joinParts([
    item.label,
    item.hero?.title,
    item.hero?.subtitle,
    INSTRUMENT_HUB_SEARCH[item.slug],
    ...(item.description || []),
    ...(item.useCases || []),
    ...(item.advantages || []).map((a) => `${a.vs} ${a.body}`),
    ...(item.features || []).map((f) => `${f.title} ${f.body}`),
  ]);
  return {
    id: `${item.group}:${item.slug}`,
    title: item.label,
    path,
    category,
    text,
  };
}

function personaEntry(p) {
  const hub = getSolutionPageData(p.slug);
  const text = joinParts([
    p.label,
    p.hero?.title,
    p.hero?.subtitle,
    p.hero?.eyebrow,
    hub?.searchText,
    ...(p.pains || []),
    ...(p.agents || []).map((a) => `${a.name} ${a.desc}`),
    ...(p.prompts || []),
  ]);
  return {
    id: `solutions:${p.slug}`,
    title: p.label,
    path: `/solutions/${p.slug}`,
    category: 'Solutions',
    text,
  };
}

function faqEntry(item, index) {
  return {
    id: `faq:${index}`,
    title: item.q,
    path: '/faq',
    category: 'FAQ',
    text: joinParts([item.q, item.a]),
  };
}

const STATIC_PAGES = [
  {
    id: 'platform:features',
    title: 'Features',
    path: '/features',
    category: 'Platform',
    text: 'Goals deliverables Consilium council Agent Hub marketplace voice chat Telegram knowledge base workflows dashboards reports organizations BYOK BYOS audit KPIs',
  },
  {
    id: 'platform:pricing',
    title: 'Pricing',
    path: '/pricing',
    category: 'Platform',
    text: 'Plans free paid business marketplace revenue share Stripe agents tools skills templates',
  },
  {
    id: 'platform:earn',
    title: 'Earn with Orqaly',
    path: '/earn',
    category: 'Platform',
    text: 'Creators marketplace publish agents tools skills templates crypto Stripe Connect payouts',
  },
  {
    id: 'platform:about',
    title: 'About',
    path: '/about',
    category: 'Platform',
    text: 'Orqaly orchestration layer agent economy mission team roadmap',
  },
  {
    id: 'platform:security',
    title: 'Security',
    path: '/security',
    category: 'Platform',
    text: 'Security RLS Supabase BYOK BYOS audit encryption Vercel VirusTotal GDPR',
  },
  {
    id: 'platform:how-it-works',
    title: 'How it works',
    path: '/how-it-works',
    category: 'Platform',
    text: 'Describe outcome agents plan execute deliverables voice chat channels',
  },
  {
    id: 'platform:marketplace',
    title: 'Marketplace',
    path: '/marketplace-preview',
    category: 'Platform',
    text: 'Marketplace browse install upload publish agents skills tools Consilium organizations businesses replicators earn crypto',
  },
  {
    id: 'platform:contact',
    title: 'Contact',
    path: '/contact',
    category: 'Platform',
    text: 'Contact sales support demo enterprise',
  },
];

export function buildSiteSearchIndex() {
  return [
    ...STATIC_PAGES,
    ...INSTRUMENTS.map(instrumentEntry),
    ...PERSONAS.map(personaEntry),
    ...FAQ_QUESTIONS.map(faqEntry),
  ];
}

export const SITE_SEARCH_INDEX = buildSiteSearchIndex();
