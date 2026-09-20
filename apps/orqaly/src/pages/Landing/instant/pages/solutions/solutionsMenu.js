/*
 * The ten Solutions pages, in the order the owner listed them. This small list is all the
 * top bar needs, so the header never pulls a page's full copy into the first download;
 * each page's content lives in ./data/<slug>.js and loads with that page.
 */

export const SOLUTIONS_BASE = '/instant/solutions';

export const SOLUTIONS_MENU = [
  { slug: 'healthcare', label: 'Healthcare', line: 'Front desk work, handled' },
  { slug: 'real-estate', label: 'Real estate', line: 'Leads answered, viewings booked' },
  { slug: 'ecommerce', label: 'E-commerce', line: 'Orders, suppliers, support' },
  { slug: 'restaurants', label: 'Hotels & restaurants', line: 'Guest requests, sorted' },
  { slug: 'education', label: 'Education', line: 'Lessons and summaries, drafted' },
  { slug: 'legal', label: 'Legal', line: 'Research and reports, prepared' },
  { slug: 'marketing', label: 'Marketing', line: 'Content out, numbers explained' },
  { slug: 'creators', label: 'Creators', line: 'One studio for every platform' },
  { slug: 'freelancers', label: 'Freelancers', line: 'Proposals, invoices, follow-ups' },
  { slug: 'manufacturing', label: 'Manufacturing', line: 'Suppliers, stock and quality' },
];

export const SOLUTION_SLUGS = SOLUTIONS_MENU.map((item) => item.slug);

export function solutionPath(slug) {
  return `${SOLUTIONS_BASE}/${slug}`;
}
