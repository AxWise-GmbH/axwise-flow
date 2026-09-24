// The "Instant" site map. The top bar, the phone menu and the router switch all read this.
// The landing is the site's front page. The sub-pages keep their /instant/ prefix so
// they do not collide with the existing public routes (/features, /how-it-works, ...).
export const INSTANT_HOME = '/';

export const INSTANT_PAGES = [
  {
    slug: 'how-it-works',
    label: 'How it works',
    path: '/instant/how-it-works',
    title: 'Orqanix — How it works',
  },
  {
    slug: 'features',
    label: 'Features',
    path: '/instant/features',
    title: 'Orqanix — Features',
  },
  {
    slug: 'speed',
    label: 'Speed',
    path: '/instant/speed',
    title: 'Orqanix — Speed',
    // Off the header, still reachable at its path and from links inside the site.
    nav: false,
  },
  // Linked from the footer only (owner): posts in ./news/news.data.js.
  {
    slug: 'news',
    label: 'News',
    path: '/instant/news',
    title: 'Orqanix — News',
    nav: false,
  },
  // The plain pages behind the footer: one template (InfoPage), copy in ./info/info.data.js.
  ...['About', 'Contact'].map((label) => ({
    slug: label.toLowerCase(),
    label,
    path: `/instant/${label.toLowerCase()}`,
    title: `Orqanix — ${label}`,
    nav: false,
    info: true,
  })),
  // Preserve the existing public notices while the Legal Center stays unpublished.
  ...['Privacy', 'Terms'].map((label) => ({
    slug: label.toLowerCase(),
    label,
    path: `/instant/${label.toLowerCase()}`,
    redirect: `/${label.toLowerCase()}`,
    nav: false,
  })),
];

// The key of a page's <title> in the current language (English: the entry's `title`).
export const pageTitleKey = (slug) => `pg.title.${slug}`;

export function instantPagePath(slug) {
  return INSTANT_PAGES.find((page) => page.slug === slug).path;
}
