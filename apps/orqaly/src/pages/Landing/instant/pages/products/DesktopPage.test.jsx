import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import DesktopPage from './DesktopPage';
import DesktopScene from './scenes/DesktopScene';
import { productPath } from './productsMenu';
import {
  BANNED,
  SOON_OK,
  expectNoMedia,
  expectUniqueIds,
  mainText,
  renderBody,
  renderProductPage,
  spoken,
} from './testUtils';

// The page's own order of sections: this pins its layout apart from the other products.
const HEADINGS = [
  'Ask. Plan. Files.',
  'Set it once. It runs.',
  'You stay in charge.',
  'What’s inside',
  'Questions',
];
const QUESTIONS = [
  'What do I need?',
  'Is it free?',
  'Where do my files go?',
  'Why does my Mac ask me to confirm the app?',
];
const PAGE_CUTS = ['hero', 'ask', 'plan', 'files', 'schedule', 'approve'];
const BRANDS = /Orqaly|AxWise|orqaly-axwise|x-axwise/i;

afterEach(cleanup);

function headings(level) {
  return screen.getAllByRole('heading', { level }).map((heading) => heading.textContent);
}

describe('DesktopPage', () => {
  it('has one h1, the product name, and its own sections in order', () => {
    renderBody(DesktopPage, 'desktop');
    expect(headings(1)).toEqual(['Desktop App']);
    expect(headings(2)).toEqual(HEADINGS);
  });

  it('sends the actions where the brief says', () => {
    renderBody(DesktopPage, 'desktop');
    expect(screen.getByRole('link', { name: 'Try For Free' })).toHaveAttribute('href', '#download');
    const how = screen.getAllByRole('link', { name: /How it works/ });
    expect(how).toHaveLength(2);
    for (const link of how) expect(link).toHaveAttribute('href', '/instant/how-it-works');
    expect(screen.getByRole('link', { name: /Features/ })).toHaveAttribute(
      'href',
      '/instant/features'
    );
  });

  it('says what the app is, a paragraph under each section, and nothing it may not say', () => {
    const { container } = renderBody(DesktopPage, 'desktop');
    expect(
      screen.getByText(
        'Orqanix is an app for your Mac. You say what you need, and AI agents make a plan, do the steps and put real files in your folder.'
      )
    ).toHaveClass('pdp-lede');
    // Each paragraph sits right under its own h2.
    for (const [heading, starts] of [
      ['Ask. Plan. Files.', 'Write or say your request in plain words'],
      ['Set it once. It runs.', 'Save any job as a recipe'],
      ['You stay in charge.', 'By default Orqanix just gets on with the work'],
    ]) {
      const next = screen.getByRole('heading', { level: 2, name: heading }).nextElementSibling;
      expect(next).toHaveClass('pdp-line');
      expect(next.textContent.startsWith(starts)).toBe(true);
    }
    // The old fact list is gone: What's inside says it now.
    expect(container.querySelector('.pdp-facts')).toBeNull();
    const text = SOON_OK(container).textContent;
    expect(text).not.toMatch(BANNED);
    expect(text).not.toMatch(BRANDS);
    expect(text).not.toMatch(/download/i);
    expect(container.querySelector('[data-soon]')).toBeNull();
  });

  it('shows six graphite cards of what is inside, each a title and one sentence', () => {
    const { container } = renderBody(DesktopPage, 'desktop');
    const tiles = [...container.querySelectorAll('.pdp-grid > .pdp-tile')];
    expect(tiles.map((tile) => tile.querySelector('h3').textContent)).toEqual([
      'Your choice of model',
      '50+ connectors',
      'Skills',
      'Ten chats at once',
      'History',
      'Research with sources',
    ]);
    for (const tile of tiles) expect(tile.querySelectorAll('p')).toHaveLength(1);
    // Each tile wears a drawn glyph from the scene kit, not a bare dot.
    expect(tiles.map((tile) => tile.querySelector('.ps-icon')?.dataset.i)).toEqual([
      'spark',
      'plus',
      'team',
      'chat',
      'clock',
      'doc',
    ]);
    expect(
      within(tiles[0]).getByText(
        'Gemini by default. Connect OpenAI or Anthropic, or run open models on your Mac.'
      )
    ).toBeInTheDocument();
  });

  it('answers four questions, each answer hidden until its row is opened', () => {
    renderBody(DesktopPage, 'desktop');
    const section = screen.getByRole('heading', { level: 2, name: 'Questions' }).closest('section');
    const rows = within(section).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual(QUESTIONS);
    const answer = within(section).getByText(
      'Into the project folder you choose on your Mac. Open, move or share them like any other file.'
    );
    expect(answer).not.toBeVisible();
    fireEvent.click(within(section).getByRole('button', { name: 'Where do my files go?' }));
    expect(rows[2]).toHaveAttribute('aria-expanded', 'true');
    expect(answer).toBeVisible();
    expect(
      within(section).getByText(
        'Yes, it’s free during the early version. We’ll publish prices before any paid plan starts.'
      )
    ).not.toBeVisible();
  });

  it('draws every picture as a cut of the Desktop App scene, with no media and unique ids', () => {
    const { container } = renderBody(DesktopPage, 'desktop');
    const stages = [...container.querySelectorAll('.ps')];
    expect(stages.map((stage) => stage.dataset.cut)).toEqual(PAGE_CUTS);
    for (const stage of stages) {
      expect(stage).toHaveAttribute('data-product', 'desktop');
      expect(stage).toHaveAttribute('aria-hidden', 'true');
      expect(stage.closest('.pdp-card')).not.toBeNull();
    }
    expectNoMedia(container);
    expectUniqueIds(container);
  });

  it('titles the three close-ups and says one sentence under each', () => {
    const { container } = renderBody(DesktopPage, 'desktop');
    const items = within(container.querySelector('.pdp-strip')).getAllByRole('listitem');
    // Each item: the close-up (a silent picture), its title and one sentence, the only words.
    expect(
      items.map((item) => [...spoken(item).children].map((child) => child.textContent))
    ).toEqual([
      [
        '',
        'Say it in plain words',
        'No prompts to learn. Attach a file or use your voice if you like.',
      ],
      [
        '',
        'Watch every step',
        'The roadmap shows what is done, what is running and what comes next.',
      ],
      [
        '',
        'Real files in your folder',
        'Documents, sheets, code and pages, marked NEW or EDITED as they change.',
      ],
    ]);
  });
});

describe('DesktopScene cuts', () => {
  it.each(['menu', ...PAGE_CUTS])('draws the %s cut as a silent picture', (cut) => {
    const { container } = render(<DesktopScene cut={cut} />);
    const stage = container.firstElementChild;
    expect(stage).toHaveClass('ps', 'pd');
    expect(stage).toHaveAttribute('data-cut', cut);
    expect(stage).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[id]')).toBeNull();
    expect(
      container.querySelector('a, button, input, select, textarea, [tabindex], [contenteditable]')
    ).toBeNull();
    expectNoMedia(container);
    const text = stage.textContent;
    expect(text).not.toMatch(BANNED);
    expect(text).not.toMatch(/download/i);
    expect(text).not.toMatch(/0[1-9]/);
    expect(text).toContain('Plan a launch for my coffee brand');
  });
});

describe('the Desktop App route', () => {
  it('opens with the page, then the download block last', async () => {
    const { container } = await renderProductPage(productPath('desktop'));
    await screen.findByRole('heading', { level: 1, name: 'Desktop App' }, { timeout: 4000 });
    expect(headings(1)).toHaveLength(1);
    expect(headings(2).slice(0, HEADINGS.length)).toEqual(HEADINGS);
    const main = container.querySelector('main');
    expect(main.lastElementChild).toHaveAttribute('id', 'download');
    expect(mainText(container)).not.toMatch(BRANDS);
    expect(SOON_OK(main).textContent).not.toMatch(BANNED);
    expectNoMedia(container);
    expectUniqueIds(container);
  });
});

// The scene's stylesheets, read from disk (the test runner hands CSS imports over empty).
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');
const HEADER_CSS = read('./scenes/desktop.css');
const PAGE_CSS = read('./scenes/desktop-page.css');
const KEYFRAMES = /@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;

/** Every selector of a stylesheet, split at its top-level commas; keyframes left out. */
function selectors(css) {
  return css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(KEYFRAMES, '')
    .match(/[^{};]+(?=\{)/g)
    .map((selector) => selector.trim())
    .filter((selector) => !selector.startsWith('@'))
    .flatMap((selector) => selector.split(/,(?![^(]*\))/).map((part) => part.trim()));
}

/** [selector, declarations] of every rule whose selector names the menu cut. */
function menuRules(css) {
  return [...css.matchAll(/([^{}]*data-cut='menu'[^{}]*)\{([^{}]*)\}/g)].map((rule) => [
    rule[1].trim(),
    rule[2],
  ]);
}

describe('Desktop scene styles', () => {
  it('scopes every rule to the Desktop scene, so it reaches no other product', () => {
    for (const selector of [...selectors(HEADER_CSS), ...selectors(PAGE_CSS)]) {
      expect(selector).toMatch(/^(\.pd\b|\.ps\.pd\b|\[data-product='desktop'\])/);
    }
    for (const selector of selectors(PAGE_CSS)) {
      expect(selector).toMatch(/^\[data-product='desktop'\]/);
    }
  });

  it('keeps the page cuts out of the header chunk and loads them with the page', () => {
    expect(HEADER_CSS).not.toMatch(/data-cut='(ask|plan|files|schedule|approve)'/);
    expect(PAGE_CSS).not.toMatch(/data-cut='(menu|hero)'/);
    expect(read('./DesktopPage.jsx')).toContain("import './scenes/desktop-page.css';");
    expect(read('./scenes/DesktopScene.jsx')).not.toMatch(/import '.\/desktop-page/);
  });

  it('moves only transforms and opacity, with no var() in a keyframe', () => {
    const frames = [...HEADER_CSS.matchAll(KEYFRAMES), ...PAGE_CSS.matchAll(KEYFRAMES)];
    expect(frames.length).toBeGreaterThan(30);
    for (const [block] of frames) {
      expect(block).not.toMatch(/var\(|width|height|background|stroke-dashoffset|top:|left:/);
    }
    // The tag holds a turning ring, so the tag itself never moves (it would cost a style pass
    // every frame); the ring and New fade on their own.
    expect(HEADER_CSS).toMatch(/\.pd \.ps-file > :not\(\.ps-file-state\),/);
  });

  it('draws every word of the menu at 1.6u or more, and at 9px or more on a phone', () => {
    const [wide, narrow] = HEADER_CSS.split('@container ps (max-width: 480px)');
    const wideRules = menuRules(wide);
    const narrowRules = menuRules(narrow.split('@keyframes')[0]);
    expect(wideRules.length).toBeGreaterThan(10);
    expect(narrowRules.length).toBeGreaterThan(10);
    for (const [selector, body] of wideRules) {
      for (const [, size] of body.matchAll(
        /(?:font-size|--pd-tag):\s*calc\(var\(--u\) \* ([\d.]+)\)/g
      )) {
        expect(Number(size), selector).toBeGreaterThanOrEqual(1.6);
      }
    }
    for (const [selector, body] of narrowRules) {
      for (const [, value] of body.matchAll(/(?:font-size|--pd-tag):\s*([^;]+);/g)) {
        expect(value, selector).toMatch(/^max\(9px,/);
      }
    }
    // The sidebar and the small mono chip are not in the header's preview.
    expect(wide).toMatch(
      /\[data-cut='menu'\] \.pd-side,\s*\[data-product='desktop'\]\[data-cut='menu'\] \.pd-steps::before \{\s*display: none;/
    );
  });

  it('opens the header and the page top mid-story, on the shared clock', () => {
    expect(HEADER_CSS).toMatch(
      /\[data-product='desktop'\]:is\(\[data-cut='menu'\], \[data-cut='hero'\]\) \.ps-scene \{\s*--pd-at: -0\.42;\s*--pd-t0: calc\(var\(--ps-loop\) \* -0\.42\);/
    );
  });

  it('opens every page cut on a full frame, one negative delay per cut', () => {
    const scene = (cut) =>
      PAGE_CSS.match(new RegExp(`\\[data-cut='${cut}'\\] \\.ps-scene \\{([^}]*)\\}`))[1];
    expect(scene('ask')).toMatch(/--pd-t0: calc\(var\(--ps-loop\) \* -0\.7\)/);
    expect(scene('plan')).toMatch(/--pd-at: -0\.52/);
    expect(scene('files')).toMatch(/--pd-at: -0\.6/);
    for (const [cut, at] of [
      ['schedule', '0.42'],
      ['approve', '0.2'],
    ]) {
      expect(scene(cut)).toContain(`--pd-at: -${at};`);
      expect(scene(cut)).toContain(`--pd-t0: calc(var(--ps-loop) * -${at});`);
    }
    // Every schedule and approval animation rides that delay, so the cut stays in step.
    const own = [...PAGE_CSS.replace(KEYFRAMES, '').matchAll(/animation: (pd-[\w-]+)[^;]*;/g)];
    expect(own.length).toBe(11);
    for (const [line] of own) expect(line).toContain('var(--pd-t0)');
  });

  it('keeps every word of the page cuts at 9px or more on a small card', () => {
    const small = PAGE_CSS.split('@container ps (max-width: 560px)')[1].split('@keyframes')[0];
    const sizes = [...small.matchAll(/font(?:-size)?:\s*([^;]+);/g)].map((match) => match[1]);
    expect(sizes.length).toBeGreaterThan(4);
    for (const size of sizes) expect(size).toMatch(/max\((9|10)px,/);
    // The compact week is Monday to Friday.
    expect(small).toMatch(/repeat\(5, 1fr\)/);
    expect(small).toMatch(/\.pd-week span:nth-child\(n \+ 6\) \{\s*display: none;/);
  });
});
