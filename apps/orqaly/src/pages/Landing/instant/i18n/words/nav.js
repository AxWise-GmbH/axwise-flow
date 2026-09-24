import { INSTANT_PAGES } from '../../pages/instantPages';
import { PRODUCTS_MENU } from '../../pages/products/productsMenu';
import { SOLUTIONS_MENU } from '../../pages/solutions/solutionsMenu';
import { FOOTER_LEGAL_LABELS } from '../../pages/legal/legal.links';

// The menu, footer and legal-link names, keyed as InstantTopBar, ProductsPanel and
// InstantFooter ask for them.
export default function words() {
  return Object.fromEntries([
    ...INSTANT_PAGES.map(({ slug, label }) => [`pages.${slug}.label`, label]),
    ...PRODUCTS_MENU.flatMap(({ slug, label, line }) => [
      [`products.${slug}.label`, label],
      [`products.${slug}.line`, line],
    ]),
    ...SOLUTIONS_MENU.flatMap(({ slug, label, line }) => [
      [`solutions.${slug}.label`, label],
      [`solutions.${slug}.line`, line],
    ]),
    ...FOOTER_LEGAL_LABELS.map(([slug, label]) => [`legal.${slug}`, label]),
  ]);
}
