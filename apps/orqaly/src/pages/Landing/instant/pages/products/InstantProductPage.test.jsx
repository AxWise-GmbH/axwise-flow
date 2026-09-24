import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, screen } from '@testing-library/react';
import { PRODUCTS_MENU, productPath } from './productsMenu';
import { BANNED, SOON_OK, expectNoMedia, expectUniqueIds, renderProductPage } from './testUtils';

const HOLDING = 'This page did not load. Please try again in a moment.';

// The API body can be told to fail, as a stale chunk or a render error would.
const failing = vi.hoisted(() => ({ on: false }));
vi.mock('./ApiPage.jsx', async (importOriginal) => {
  const { default: ApiPage } = await importOriginal();
  return {
    default: (props) => {
      if (failing.on) throw new Error('A stale chunk');
      return <ApiPage {...props} />;
    },
  };
});

afterEach(() => {
  cleanup();
  failing.on = false;
  vi.restoreAllMocks();
});

async function openAt(path) {
  const view = await renderProductPage(path);
  const heading = await screen.findByRole('heading', { level: 1 }, { timeout: 4000 });
  return { ...view, heading };
}

describe('InstantProductPage', () => {
  it.each([productPath(''), '/instant/products', productPath('nope')])(
    'opens the Desktop App for %s',
    async (path) => {
      const { heading } = await openAt(path);
      expect(heading).toHaveTextContent('Desktop App');
      expect(document.title).toBe('Orqanix — Desktop App');
    }
  );

  it.each(PRODUCTS_MENU)(
    'opens $label with one h1, its title and the download block last',
    async (product) => {
      const { container, heading } = await openAt(productPath(product.slug));
      expect(heading).toHaveTextContent(product.label);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(document.title).toBe(`Orqanix — ${product.label}`);

      const main = container.querySelector('main');
      expect(main.lastElementChild).toHaveAttribute('id', 'download');
      expect(heading.compareDocumentPosition(main.lastElementChild)).toBe(
        Node.DOCUMENT_POSITION_FOLLOWING
      );
      expectNoMedia(container);
      expectUniqueIds(container);
      const body = main.firstElementChild;
      expect(SOON_OK(body).textContent).not.toMatch(BANNED);
      // "Coming soon" belongs to Personalised Models alone.
      if (!product.soon) expect(body.querySelector('[data-soon]')).toBeNull();
    }
  );

  it('starts every product page at the top', async () => {
    window.scrollTo = vi.fn();
    await openAt(productPath('mobile'));
    expect(window.scrollTo).toHaveBeenCalledWith(0, 0);
  });

  it('keeps the header, the download block and the footer when a body fails', async () => {
    failing.on = true;
    // React reports the caught error; the page itself carries on.
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { container, heading } = await openAt(productPath('api'));

    expect(heading).toHaveTextContent('API');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByText(HOLDING)).toBeInTheDocument();
    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();
    expect(container.querySelector('main').lastElementChild).toHaveAttribute('id', 'download');
    expect(document.title).toBe('Orqanix — API');
  });
});
