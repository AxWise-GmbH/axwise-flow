/*
 * Shared checks for the product menu, scenes and pages tests. Test-only: nothing in the site
 * imports this file.
 */
import { createElement } from 'react';
import { render } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { expect, vi } from 'vitest';
import { SOON_LABEL, findProduct, productPath } from './productsMenu';

// Copy the site never prints. "Coming soon" is allowed on Personalised Models only, on a pill
// marked data-soon: take those out with SOON_OK before testing text against this.
export const BANNED =
  /\b(planned|beta|soon|coming|shield|soc ?2|verified|production|guaranteed?|slack|telegram|whatsapp|orqaly|axwise)\b|zero hallucination/i;

/**
 * A copy of `node` without its "Coming soon" pills ([data-soon]). Each pill must say exactly
 * that (or nothing, when CSS draws the words), so the mark cannot hide other copy.
 */
export function SOON_OK(node) {
  const copy = node.cloneNode(true);
  for (const pill of copy.querySelectorAll('[data-soon]')) {
    expect(['', SOON_LABEL]).toContain(pill.textContent.trim());
    pill.remove();
  }
  return copy;
}

/** A copy of `node` without its aria-hidden parts: what a screen reader gets. */
export function spoken(node) {
  const copy = node.cloneNode(true);
  for (const hidden of copy.querySelectorAll('[aria-hidden="true"]')) hidden.remove();
  return copy;
}

/** The text of <main> (or of `container` when there is none); `spokenOnly` drops aria-hidden parts. */
export function mainText(container, { spokenOnly = false } = {}) {
  const main = container.querySelector('main') ?? container;
  return (spokenOnly ? spoken(main) : main).textContent.replace(/\s+/g, ' ').trim();
}

/** No img, iframe or video anywhere; a canvas only inside an aria-hidden [data-orb] light. */
export function expectNoMedia(root) {
  expect(root.querySelectorAll('img, iframe, video')).toHaveLength(0);
  for (const canvas of root.querySelectorAll('canvas')) {
    expect(canvas.closest('[data-orb][aria-hidden="true"]')).not.toBeNull();
  }
}

/** Every id under `root` is used once. */
export function expectUniqueIds(root) {
  const ids = [...root.querySelectorAll('[id]')].map((element) => element.id);
  expect(ids.filter((id, index) => ids.indexOf(id) !== index)).toEqual([]);
}

/** One product body on its own, with the menu entry it is given in the site. */
export function renderBody(Body, slug) {
  return render(
    createElement(MemoryRouter, null, createElement(Body, { product: findProduct(slug) }))
  );
}

/**
 * The whole product route (layout, body, download block) at `path`. Loaded on call, so the
 * light tests never pull in the layout. The body arrives lazily: await
 * findByRole('heading', { level: 1 }) before looking at it.
 */
export async function renderProductPage(path = productPath('desktop')) {
  const { default: InstantProductPage } = await import('./InstantProductPage');
  // jsdom has no scrolling; keep a spy the test set up.
  if (!vi.isMockFunction(window.scrollTo)) window.scrollTo = vi.fn();
  return render(
    createElement(
      MemoryRouter,
      { initialEntries: [path] },
      createElement(
        Routes,
        null,
        createElement(Route, {
          path: '/instant/products/:slug?',
          element: createElement(InstantProductPage),
        })
      )
    )
  );
}
