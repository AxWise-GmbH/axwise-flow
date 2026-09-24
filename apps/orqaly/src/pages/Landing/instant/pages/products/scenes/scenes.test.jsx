import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/react';
import { ProductScene, SCENES } from './index';
import { PRODUCT_SLUGS, SOON_LABEL } from '../productsMenu';
import { BANNED, SOON_OK, expectNoMedia } from '../testUtils';

// Every stylesheet in this folder, the kit's and each scene's own, read from disk (the test
// runner hands CSS imports over empty).
const HERE = dirname(fileURLToPath(import.meta.url));
const STYLES = Object.fromEntries(
  readdirSync(HERE)
    .filter((file) => file.endsWith('.css'))
    .map((file) => [file, readFileSync(join(HERE, file), 'utf8')])
);
const kitCss = STYLES['kit.css'];

const SOON_SLUG = 'personalised-models';

function renderScene(slug, cut) {
  const { container } = render(<ProductScene slug={slug} cut={cut} />);
  return { container, root: container.firstElementChild };
}

/** The strings a stylesheet prints with content: '...'. */
function cssContent(css) {
  return [...css.matchAll(/content:\s*(['"])(.*?)\1/g)].map((match) => match[2]);
}

describe('product scenes', () => {
  it('has one scene per product', () => {
    expect(Object.keys(SCENES)).toEqual(PRODUCT_SLUGS);
  });

  describe.each(PRODUCT_SLUGS)('%s', (slug) => {
    it.each(['menu', 'hero'])('draws the %s cut as a silent picture', (cut) => {
      const { container, root } = renderScene(slug, cut);
      expect(root).toHaveClass('ps');
      expect(root).toHaveAttribute('aria-hidden', 'true');
      expect(root).toHaveAttribute('data-product', slug);
      expect(root).toHaveAttribute('data-cut', cut);
      expect(root.querySelector('.ps-scene')).not.toBeNull();
      // Nothing to reach or name: no ids, nothing focusable, no media of any kind.
      expect(container.querySelector('[id]')).toBeNull();
      expect(
        container.querySelector('a, button, input, select, textarea, [tabindex], [contenteditable]')
      ).toBeNull();
      expectNoMedia(container);
      expect(container.querySelector('canvas')).toBeNull();

      const text = (slug === SOON_SLUG ? SOON_OK(root) : root).textContent;
      expect(text).not.toMatch(BANNED);
      expect(text).not.toMatch(/download/i);
      // The phone sheet test bans these pairs in its text, and the sheet plays every scene.
      expect(text).not.toMatch(/0[1-9]/);
    });
  });

  it('keeps "Coming soon" off every scene but Personalised Models', () => {
    for (const slug of PRODUCT_SLUGS.filter((item) => item !== SOON_SLUG)) {
      for (const cut of ['menu', 'hero']) {
        const { root } = renderScene(slug, cut);
        expect(root.querySelector('[data-soon]')).toBeNull();
        expect(root.textContent).not.toContain(SOON_LABEL);
      }
    }
  });

  it('passes a class name to the stage and draws nothing for an unknown product', () => {
    const { container } = render(<ProductScene slug="api" className="menu-layer" />);
    expect(container.firstElementChild).toHaveClass('ps', 'menu-layer');
    expect(render(<ProductScene slug="nope" />).container).toBeEmptyDOMElement();
  });

  it('starts on the menu cut', () => {
    expect(renderScene('desktop').root).toHaveAttribute('data-cut', 'menu');
  });
});

describe('scene styles', () => {
  it('rests every animation off screen', () => {
    expect(kitCss).toMatch(
      /\.ps\[data-live='false'\] \*[\s\S]*?\{\s*animation-play-state: paused !important;/
    );
  });

  it('shows the finished frame under reduced motion', () => {
    expect(kitCss).toMatch(
      /@media \(prefers-reduced-motion: reduce\) \{\s*\.ps \*,[\s\S]*?\{\s*animation: none !important;\s*transition: none !important;/
    );
  });

  it('sizes a scene by its card, never the screen', () => {
    expect(kitCss).toMatch(/container-type: inline-size;/);
    expect(kitCss).toMatch(/container-name: ps;/);
    expect(kitCss).toMatch(/--ps-u: 1cqi;\s*--u: var\(--ps-u\);/);
    expect(kitCss).toMatch(/--ps-loop: \d+s;/);
  });

  it.each(Object.keys(STYLES))('%s stays monochrome', (file) => {
    const css = STYLES[file];
    for (const [, hex] of css.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)) {
      const channels = hex.length === 3 ? [...hex] : hex.match(/../g);
      expect(new Set(channels.map((channel) => channel.toLowerCase())).size, `#${hex}`).toBe(1);
    }
    for (const [match, r, g, b] of css.matchAll(/rgba?\(\s*(\d+)[\s,]+(\d+)[\s,]+(\d+)/g)) {
      expect(new Set([r, g, b]).size, match).toBe(1);
    }
  });

  it.each(Object.keys(STYLES))('%s prints no banned words', (file) => {
    for (const printed of cssContent(STYLES[file])) {
      expect(printed).not.toMatch(/download/i);
      if (file.startsWith('models') && printed === SOON_LABEL) continue;
      expect(printed).not.toMatch(BANNED);
    }
  });
});
