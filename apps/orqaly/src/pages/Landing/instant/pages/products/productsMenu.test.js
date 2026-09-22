import { describe, expect, it } from 'vitest';
import {
  NAV_PRODUCTS,
  PRODUCTS_BASE,
  PRODUCTS_MENU,
  PRODUCT_SLUGS,
  SOON_LABEL,
  findProduct,
  productFromPath,
  productPath,
} from './productsMenu';
import { BANNED } from './testUtils';

// The body files InstantProductPage can open (it names them after the slug's last word).
const PAGE_FILES = import.meta.glob(['./*Page.jsx', '!./InstantProductPage.jsx']);
const FILE_FOR = {
  desktop: './DesktopPage.jsx',
  mobile: './MobilePage.jsx',
  api: './ApiPage.jsx',
  'assistant-bot': './BotPage.jsx',
  'personalised-models': './ModelsPage.jsx',
  enterprise: './EnterprisePage.jsx',
};

describe('products menu data', () => {
  it("lists the six products once each, in the owner's order", () => {
    expect(PRODUCT_SLUGS).toEqual([
      'desktop',
      'mobile',
      'api',
      'assistant-bot',
      'personalised-models',
      'enterprise',
    ]);
    expect(PRODUCTS_MENU.map((item) => item.label)).toEqual([
      'Desktop App',
      'Mobile App',
      'API',
      'Assistant Bot',
      'Personalised Models',
      'Enterprise',
    ]);
    expect(new Set(PRODUCT_SLUGS).size).toBe(PRODUCT_SLUGS.length);
  });

  it('keeps Personalised Models, and only it, out of the header and footer', () => {
    expect(PRODUCTS_MENU.filter((item) => item.nav === false).map((item) => item.slug)).toEqual([
      'personalised-models',
    ]);
    expect(NAV_PRODUCTS.map((item) => item.slug)).toEqual(
      PRODUCT_SLUGS.filter((slug) => slug !== 'personalised-models')
    );
  });

  it('marks Personalised Models, and only it, as coming soon', () => {
    expect(PRODUCTS_MENU.filter((item) => item.soon).map((item) => item.slug)).toEqual([
      'personalised-models',
    ]);
    expect(SOON_LABEL).toBe('Coming soon');
  });

  it.each(PRODUCTS_MENU)('keeps the line for $label short and plain', ({ label, line }) => {
    expect(line.length).toBeLessThanOrEqual(44);
    expect(line).not.toMatch(/\d/);
    for (const text of [label, line]) {
      expect(text).not.toMatch(/download/i);
      expect(text).not.toMatch(BANNED);
    }
  });

  it('has a page body for every product, and no other', () => {
    expect(Object.keys(FILE_FOR)).toEqual(PRODUCT_SLUGS);
    expect(Object.keys(PAGE_FILES).sort()).toEqual(Object.values(FILE_FOR).sort());
  });

  it('builds and reads product paths', () => {
    expect(PRODUCTS_BASE).toBe('/instant/products');
    expect(productPath('api')).toBe('/instant/products/api');
    expect(findProduct('assistant-bot')?.label).toBe('Assistant Bot');
    expect(findProduct('nope')).toBeNull();
    expect(findProduct(undefined)).toBeNull();
  });

  it.each([
    ['/instant/products/desktop', 'desktop'],
    ['/instant/products/mobile', 'mobile'],
    ['/instant/products/personalised-models', 'personalised-models'],
    ['/instant/products/api/', 'api'],
    ['/instant/products', null],
    ['/instant/products/', null],
    ['/instant/products/nope', null],
    ['/instant/products/api/more', null],
    ['/instant/solutions/healthcare', null],
    ['/instant/features', null],
    ['/', null],
  ])('knows the product open at %s', (pathname, slug) => {
    expect(productFromPath(pathname)?.slug ?? null).toBe(slug);
  });
});
