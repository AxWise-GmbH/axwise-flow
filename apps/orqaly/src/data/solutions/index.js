import * as healthcare from './healthcarePage';
import * as realEstate from './realEstatePage';
import * as ecommerce from './ecommercePage';
import * as restaurants from './restaurantsPage';
import * as education from './educationPage';
import * as legal from './legalPage';
import * as marketing from './marketingPage';
import * as creators from './creatorsPage';
import * as freelancers from './freelancersPage';
import * as manufacturing from './manufacturingPage';
import { agentsToMosaicFeatures } from './_helpers';
import { PERSONA_BY_SLUG } from '../personas';

const PAGE_MODULES = {
  healthcare,
  'real-estate': realEstate,
  ecommerce,
  restaurants,
  education,
  legal,
  marketing,
  creators,
  freelancers,
  manufacturing,
};

/** Spotlight keys in render order per slug */
const SPOTLIGHT_KEYS = {
  healthcare: ['SPOTLIGHT_VOICE', 'SPOTLIGHT_CHAT', 'SPOTLIGHT_REMINDERS', 'SPOTLIGHT_INTAKE'],
  'real-estate': [
    'SPOTLIGHT_LISTING',
    'SPOTLIGHT_CHAT',
    'SPOTLIGHT_VIEWINGS',
    'SPOTLIGHT_FOLLOWUP',
  ],
  ecommerce: ['SPOTLIGHT_ORDERS', 'SPOTLIGHT_SUPPLIERS', 'SPOTLIGHT_SUPPORT', 'SPOTLIGHT_RETURNS'],
  restaurants: [
    'SPOTLIGHT_RESERVATIONS',
    'SPOTLIGHT_HOUSEKEEPING',
    'SPOTLIGHT_ROOMSERVICE',
    'SPOTLIGHT_PARTNERS',
  ],
  education: ['SPOTLIGHT_LESSONS', 'SPOTLIGHT_SUMMARIES', 'SPOTLIGHT_PATHS', 'SPOTLIGHT_KB'],
  legal: ['SPOTLIGHT_ECOSYSTEM', 'SPOTLIGHT_REPORTS', 'SPOTLIGHT_JURISDICTION', 'SPOTLIGHT_VAULT'],
  marketing: ['SPOTLIGHT_SMM', 'SPOTLIGHT_CONTENT', 'SPOTLIGHT_METRICS', 'SPOTLIGHT_PARTNERS'],
  creators: [
    'SPOTLIGHT_CALENDAR',
    'SPOTLIGHT_SCRIPTS',
    'SPOTLIGHT_REPURPOSE',
    'SPOTLIGHT_SPONSORS',
  ],
  freelancers: [
    'SPOTLIGHT_DISCOVERY',
    'SPOTLIGHT_PROPOSAL',
    'SPOTLIGHT_INVOICE',
    'SPOTLIGHT_FOLLOWUP',
  ],
  manufacturing: [
    'SPOTLIGHT_SUPPLIER',
    'SPOTLIGHT_INVENTORY',
    'SPOTLIGHT_QC',
    'SPOTLIGHT_LEADTIME',
  ],
};

export function getSolutionPageData(slug) {
  const mod = PAGE_MODULES[slug];
  const persona = PERSONA_BY_SLUG[slug];
  if (!mod || !persona) return null;

  const spotlightKeys = SPOTLIGHT_KEYS[slug] || [];
  const spotlights = spotlightKeys.map((key) => mod[key]).filter(Boolean);

  const mosaicFeatures =
    mod.MOSAIC_FEATURES || agentsToMosaicFeatures(persona.agents, persona.iconName);

  return {
    hubIntro: mod.HUB_INTRO,
    pillars: mod.PILLARS,
    spotlights,
    mosaicTitle: mod.MOSAIC_TITLE,
    mosaicSubtitle: mod.MOSAIC_SUBTITLE,
    mosaicFeatures,
    closingCta: mod.CLOSING_CTA,
    relatedItems: mod.RELATED_ITEMS,
    searchText: joinSearchText(mod),
  };
}

function joinSearchText(mod) {
  const parts = [
    mod.HUB_INTRO?.eyebrow,
    mod.HUB_INTRO?.title,
    mod.HUB_INTRO?.subtitle,
    ...(mod.PILLARS || []).flatMap((p) => [p.title, p.body]),
    ...Object.keys(mod)
      .filter((k) => k.startsWith('SPOTLIGHT_'))
      .flatMap((k) => {
        const s = mod[k];
        return s ? [s.title, s.body, ...(s.bullets || [])] : [];
      }),
  ];
  return parts.filter(Boolean).join(' ');
}

export { PAGE_MODULES, SPOTLIGHT_KEYS };
