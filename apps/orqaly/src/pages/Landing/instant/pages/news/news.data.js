/*
 * The News page and its articles. Newest first, by date.
 *
 * Dates follow git: a post with a `source` is dated by that commit and shows the day; a post
 * without one is work in progress, dated by month only. `source` is also the hook for a later
 * sync from GitHub pushes. Keep every claim to what the code and the repo docs show.
 *
 * The article texts live in ./news.bodies.json, keyed by slug, and load when an article
 * opens: they stay out of the JavaScript the site ships. Blocks: a string is a paragraph,
 * { h } a section heading, { list } a bullet list. The first section has no heading. Work in
 * progress says so ("we are building", "our goal").
 *
 * Other languages: titles, summaries and categories go through t() (keys from newsKey and
 * categoryKey, listed for translators by i18n/words/nw.js). Article texts in another language
 * are ./bodies/<code>.json, the same shape as ./news.bodies.json; a missing file or slug shows
 * the English text.
 */

import bodiesUrl from './news.bodies.json?url';
import { SKIP_KEYS, localize } from '../../i18n/localize';

export const NEWS_CATEGORIES = ['Product', 'Research', 'API', 'Company'];

const POSTS = [
  {
    slug: 'tiny-llms-under-a-cent',
    title: 'Many tiny LLMs, one answer, under $0.01',
    summary:
      'Many small AI models finishing one request together, for under one cent. That is the goal we are working on.',
    date: '2026-09-21',
    precision: 'month',
    category: 'Research',
    cover: 'swarm',
    source: null,
  },
  {
    slug: 'connect-any-agent',
    title: 'Connect any agent',
    summary:
      'Grok, Meta Muse, OpenClaw, Manus, Hermes Agents, CrewAI and more, used from one place. That is what we are building.',
    date: '2026-09-20',
    precision: 'month',
    category: 'Product',
    cover: 'wires',
    source: null,
  },
  {
    slug: 'assistant-bot-for-business',
    title: 'An assistant bot for your business',
    summary:
      'A bot your team will ask from the messenger and email it already uses, with the answer in the same thread. It is in the works.',
    date: '2026-09-19',
    precision: 'month',
    category: 'Product',
    cover: 'chat',
    source: null,
  },
  {
    slug: 'building-the-mobile-app',
    title: 'We are building the mobile app',
    summary:
      'A phone app to start a task on the go, follow the steps, and find the files waiting on your Mac. It is in the works.',
    date: '2026-09-18',
    precision: 'month',
    category: 'Product',
    cover: 'phone',
    source: null,
  },
  {
    slug: 'orqanix-for-mac',
    title: 'Orqanix for Mac, made for Apple silicon',
    summary:
      'The first desktop preview: sign in, ask for what you need, and watch the plan and the files come together.',
    date: '2026-09-13',
    precision: 'day',
    category: 'Product',
    cover: 'window',
    source: {
      repo: 'orqaly-goose',
      commit: 'bb58b868d',
      subject: 'feat: package authenticated Orqaly desktop preview',
    },
  },
  {
    slug: 'orqaly-and-axwise-merge',
    title: 'Orqaly and AxWise are now one',
    summary:
      'The part that decides who does the work and the app that does it now share one home for their code.',
    date: '2026-09-13',
    precision: 'day',
    category: 'Company',
    cover: 'merge',
    source: {
      repo: 'axwise-flow-oss',
      commit: '26e447a9',
      subject: 'Merge tested AxWise runtime and consolidate Orqaly in monorepo',
    },
  },
  {
    slug: 'business-api',
    title: 'A business API for our reasoning layer',
    summary:
      'Send a task, get back a clear decision: who should do it, why, and which checks and backups come with it.',
    date: '2026-07-16',
    precision: 'day',
    category: 'API',
    cover: 'api',
    source: {
      repo: 'axwise-flow-oss',
      commit: '91619931',
      subject:
        'feat: implement orchestration engine framework with decision services, routing, and hybrid research adapters',
    },
  },
  {
    slug: 'opening-the-source',
    title: 'Opening the source',
    summary:
      'We are opening the source of AxWise Flow, the reasoning layer inside Orqanix. Here is why, and what Apache 2.0 allows.',
    date: '2026-07-05',
    precision: 'day',
    category: 'Company',
    cover: 'open',
    source: {
      repo: 'axwise-flow-oss',
      commit: '1a7bcb74',
      subject: 'docs: correct open-source repository paths and installation setup instructions',
    },
  },
];

// Newest first; posts on the same day keep the order written above.
export const NEWS = POSTS.map((post, index) => ({ post, index }))
  .sort((a, b) => b.post.date.localeCompare(a.post.date) || a.index - b.index)
  .map(({ post }) => post);

export function newsPath(slug) {
  return slug ? `/instant/news/${slug}` : '/instant/news';
}

export function findNews(slug) {
  return NEWS.find((post) => post.slug === slug) ?? null;
}

// Every language edition of the texts, by file (see ./bodies/README.md). Exported so a test
// can add one.
export const NEWS_BODY_FILES = import.meta.glob('./bodies/*.json', {
  query: '?url&no-inline',
  import: 'default',
  eager: true,
});

const bodyUrl = (lang) =>
  lang === 'en' ? bodiesUrl : NEWS_BODY_FILES[`./bodies/${lang}.json`] ?? null;

// One request per language for all its texts, shared by every article. A failed request is
// forgotten, so opening an article again tries again instead of replaying the failure.
const bodies = new Map();

function loadBodies(lang) {
  if (!bodies.has(lang)) {
    const request = fetch(bodyUrl(lang))
      .then((response) => {
        if (!response.ok) throw new Error(`News texts did not load (${response.status})`);
        return response.json();
      })
      .catch((error) => {
        bodies.delete(lang);
        throw error;
      });
    bodies.set(lang, request);
  }
  return bodies.get(lang);
}

function englishBody(slug) {
  return loadBodies('en').then((all) => {
    if (!all[slug]) throw new Error(`No news text for "${slug}"`);
    return all[slug];
  });
}

/** One article's blocks in `lang`; English when that language lacks the file or the post. */
export function loadNewsBody(slug, lang = 'en') {
  if (lang === 'en' || !bodyUrl(lang)) return englishBody(slug);
  return loadBodies(lang).then(
    (all) => all[slug] ?? englishBody(slug),
    () => englishBody(slug)
  );
}

// Keys for the words of a post and of a category (i18n/words/nw.js lists the same).
export const newsKey = (slug) => `nw.post.${slug}`;
export const categoryKey = (name) => `nw.category.${name}`;
// The category has its own key, shared by every post in it.
export const NEWS_SKIP = new Set([...SKIP_KEYS, 'category']);

export function categoryLabel(name, t) {
  return t(categoryKey(name), name);
}

/** The post with its title, summary and category in the current language. */
export function localizePost(post, t) {
  return {
    ...localize(post, newsKey(post.slug), t, NEWS_SKIP),
    category: categoryLabel(post.category, t),
  };
}

/**
 * "Sep 13, 2026" for a dated post, "September 2026" for one dated by month only, in the
 * words of `lang`.
 */
export function formatNewsDate(post, lang = 'en') {
  const [year, month, day] = post.date.split('-').map(Number);
  const options =
    post.precision === 'day'
      ? { year: 'numeric', month: 'short', day: 'numeric' }
      : { year: 'numeric', month: 'long' };
  return new Intl.DateTimeFormat(lang, { ...options, timeZone: 'UTC' }).format(
    new Date(Date.UTC(year, month - 1, day))
  );
}
