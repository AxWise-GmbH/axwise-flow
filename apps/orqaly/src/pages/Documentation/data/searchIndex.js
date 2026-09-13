import { FAQ_ITEMS } from './faq';
import { API_ENDPOINTS } from './api';
import { ENV_VARS } from './env';
import { DB_TABLES } from './database';
import { PAGES_FEATURES } from './pages';
import { LLM_PROVIDERS } from './providers';
import { TABS, TAB_DESCRIPTIONS } from './tabs';

/** Stable DOM id shared by the search index and the section that renders the row. */
export function docId(type, key) {
  return `doc-${type}-${String(key).replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '')}`;
}

/**
 * Flatten every documentation dataset into a uniform, searchable record list.
 * Each record: { id, tab, type, title, subtitle, body }.
 * Pure and synchronous so it can be built once with useMemo and unit-tested.
 */
export function buildDocSearchIndex() {
  const records = [];

  // One record per tab so a query like "consilium" jumps straight to the section.
  for (const tab of TABS) {
    records.push({
      id: docId('section', tab.key),
      tab: tab.key,
      type: 'section',
      title: tab.label,
      subtitle: TAB_DESCRIPTIONS[tab.key] || '',
      body: '',
    });
  }

  FAQ_ITEMS.forEach((item, i) => {
    records.push({
      id: docId('faq', i),
      tab: 'faq',
      type: 'faq',
      title: item.q,
      subtitle: '',
      body: item.a,
    });
  });

  API_ENDPOINTS.forEach((e, i) => {
    records.push({
      id: docId('endpoint', i),
      tab: 'architecture',
      type: 'endpoint',
      title: `${e.method} ${e.path}`,
      subtitle: e.desc,
      body: `${e.auth} ${e.rate}`,
    });
  });

  ENV_VARS.forEach((v) => {
    records.push({
      id: docId('env', v.name),
      tab: 'start',
      type: 'env',
      title: v.name,
      subtitle: v.description,
      body: `${v.group} ${v.scope}`,
    });
  });

  DB_TABLES.forEach((t) => {
    records.push({
      id: docId('table', t.name),
      tab: 'architecture',
      type: 'table',
      title: t.name,
      subtitle: t.description,
      body: `${t.domain} ${t.rls}`,
    });
  });

  PAGES_FEATURES.forEach((pg) => {
    records.push({
      id: docId('page', pg.path),
      tab: 'product',
      type: 'page',
      title: pg.name,
      subtitle: pg.description,
      body: pg.path,
    });
  });

  LLM_PROVIDERS.forEach((p) => {
    records.push({
      id: docId('provider', p.id),
      tab: 'providers',
      type: 'provider',
      title: p.name,
      subtitle: `${p.model} · ${p.env}`,
      body: `${p.baseUrl} ${p.note}`,
    });
  });

  return records;
}

/** Human labels for each record type (used for grouped result headers). */
export const TYPE_LABELS = {
  section: 'Sections',
  faq: 'FAQ',
  endpoint: 'Endpoints',
  env: 'Environment',
  table: 'Tables',
  page: 'Pages',
  provider: 'Providers',
};
