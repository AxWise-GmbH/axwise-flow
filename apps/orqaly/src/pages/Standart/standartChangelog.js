/**
 * [module: frontend]
 *
 * Launch notes on the public landing page, by hand.
 *
 * There is no CMS behind this page and there is not going to be one. This module
 * is the whole news section: the featured post, the card row and the "All posts"
 * list are all derived from the one array below, so they cannot drift apart.
 *
 * MAINTENANCE CONTRACT - read before adding an entry.
 *
 *  1. One entry per shipped change that a CUSTOMER would notice. The commit log
 *     is written for the people building the product; this list is not. Real
 *     work gets left out here all the time and that is correct: "animate the tab
 *     underline" is a genuine improvement and means nothing to a business owner.
 *
 *  2. `date` MUST be the commit's author date. Get it, do not type it:
 *       git log --date=short --pretty='%h %ad %s' -30
 *
 *  3. `commit` is the short hash and it is the receipt. It is the reason every
 *     date on this page is real rather than plausible. An entry without one does
 *     not ship, and standartChangelog.test.js enforces that.
 *
 *  4. Never write an entry for work that is not merged. There are no "coming
 *     soon" posts here - a roadmap on a news page is a promise with a date on it.
 *
 *  5. Append at the top. Ordering, featuring and formatting are all derived
 *     below, so there is no `featured` flag to forget to move.
 */

/**
 * @typedef {object} ChangelogEntry
 * @property {string} id        stable slug, used as a React key
 * @property {string} commit    short hash - the receipt for `date`
 * @property {string} date      ISO, the commit's author date
 * @property {string} title     what a customer would call it
 * @property {string} summary   one sentence, same voice as the rest of the page
 * @property {string} [sectionId] an anchor on this page that shows the thing
 */

/** @type {ChangelogEntry[]} */
const ENTRIES = [
  {
    id: 'gcp-personal-sessions',
    commit: '0bceca6d',
    date: '2026-09-01',
    title: 'The launch moved to GCP with personal sessions',
    summary:
      'The public app now leads into a focused GCP workspace protected by personal Clerk sign-in.',
    sectionId: 'security',
  },
  {
    id: 'assistant-goal-flow',
    commit: 'fb316a1e',
    date: '2026-08-31',
    title: 'Assistant can hand substantial work to a Goal',
    summary:
      'A conversation can now become a durable Goal with scope, plan, approvals, progress, and a final artifact.',
    sectionId: 'how',
  },
  {
    id: 'safe-return-paths',
    commit: 'a5715da0',
    date: '2026-09-01',
    title: 'Sign-in keeps safe return paths',
    summary:
      'After authentication, a valid Assistant or Goals destination remains intact without accepting an unsafe redirect.',
    sectionId: 'security',
  },
  {
    id: 'accepted-scope-sections',
    commit: '116b3f26',
    date: '2026-08-29',
    title: 'Accepted scope stays intact',
    summary:
      'The durable Goal preserves the sections you approved when it produces and displays later artifacts.',
    sectionId: 'features',
  },
];

/**
 * Newest first. Derived, so adding an entry anywhere puts it in the right place.
 *
 * String comparison rather than Date.parse: the dates are ISO, which sorts
 * lexicographically, and it avoids a timezone shifting an entry across a day
 * boundary depending on where the build ran.
 */
export const CHANGELOG = [...ENTRIES].sort((a, b) =>
  a.date < b.date ? 1 : a.date > b.date ? -1 : 0
);

/** The featured post. Derived - never hand-picked, so it cannot go stale. */
export const FEATURED = CHANGELOG[0];

/** The card row under the featured post. */
export const CARDS = CHANGELOG.slice(1, 5);

/**
 * The "All posts" list.
 *
 * Everything, featured included. A list labelled "all posts" that quietly omits
 * one is a bug report waiting to happen.
 */
export const ALL_POSTS = CHANGELOG;

/**
 * One formatter, imported by all three renderers.
 *
 * en-GB rather than the visitor's locale, deliberately: a fixed format keeps the
 * right-aligned date column in the list a consistent width, and a US visitor
 * reading "29 Aug 2026" loses nothing.
 */
const FORMAT = new Intl.DateTimeFormat('en-GB', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
});

/** @param {string} iso */
export function formatEntryDate(iso) {
  // Noon UTC, not midnight: a midnight timestamp read in a negative-offset
  // timezone lands on the previous day and the page shows the wrong date.
  const parsed = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? iso : FORMAT.format(parsed);
}
