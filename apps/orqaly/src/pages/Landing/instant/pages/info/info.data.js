import { COMPANY, LAST_UPDATED } from './company';
import { SKIP_KEYS } from '../../i18n/localize';

/*
 * Copy for the two text pages behind the footer (the legal texts live in ../legal/docs). Each page has the fields its own layout
 * needs; a legal section has a title and any of text (paragraphs), list (bullets) and links.
 * Every claim about the app or the site here was checked against the code; keep it so.
 */

const operator = [COMPANY.legalName, COMPANY.address].filter(Boolean).join(', ');

// The long text (story, goal, mission, founders) is ./about/<lang>.json, fetched by the page.
const about = {
  tag: 'About',
  title: 'Two paths. One platform.',
  line: 'Two product managers set out on their own, then found they were building the same thing.',
  email: COMPANY.email,
};

const contact = {
  tag: 'Company',
  title: 'Contact',
  line: 'Write to us. A person reads it.',
  channels: [
    {
      icon: 'hello',
      title: 'Say hello',
      text: 'Questions, feedback and help with the app.',
      email: COMPANY.email,
    },
    {
      icon: 'privacy',
      title: 'Privacy',
      text: 'Ask what we hold about you, or ask us to delete it.',
      email: COMPANY.privacyEmail,
    },
    {
      icon: 'security',
      title: 'Security',
      text: 'Found a weak spot? Tell us first. We answer quickly.',
      email: COMPANY.securityEmail,
    },
  ],
  operator,
};

export const INFO_PAGES = { about, contact };

// Translated at render with localize(page, infoPrefix(slug), t, INFO_SKIP): mail addresses
// and the company's registered name and address stay as written.
export const infoPrefix = (slug) => `pg.info.${slug}`;
export const INFO_SKIP = new Set([...SKIP_KEYS, 'email', 'operator']);
