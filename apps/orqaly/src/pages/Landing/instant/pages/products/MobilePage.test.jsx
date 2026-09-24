import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import MobilePage from './MobilePage';
import MobileScene from './scenes/MobileScene';
import { SOON_LABEL, productPath } from './productsMenu';
import {
  BANNED,
  SOON_OK,
  expectNoMedia,
  expectUniqueIds,
  mainText,
  renderBody,
  renderProductPage,
} from './testUtils';

// The page's own order: split hero, three phone screens, the one rule, where the files live,
// then the questions. It pins the layout apart from the other products.
const HEADINGS = [
  'From your phone',
  'Works while your Mac is online.',
  'Your files stay on your Mac.',
  'Questions',
];
const CARDS = ['Check', 'Re-run', 'Start', 'A note when it’s done', 'Pick up at your desk'];
const QUESTIONS = [
  'Do I need the Mac app?',
  'What if my Mac is off?',
  'Can I start new work from my phone?',
];
const PAGE_CUTS = ['hero', 'check', 'rerun', 'start', 'online'];
const ALL_CUTS = ['menu', ...PAGE_CUTS];
const BRANDS = /Orqaly|AxWise|orqaly-axwise|x-axwise/i;
const STORES = /App Store|Google Play/i;
const HERE = dirname(fileURLToPath(import.meta.url));

afterEach(cleanup);

function headings(level) {
  return screen.getAllByRole('heading', { level }).map((heading) => heading.textContent);
}

describe('MobilePage', () => {
  it('has one h1, the product name, and its own sections in order', () => {
    renderBody(MobilePage, 'mobile');
    expect(headings(1)).toEqual(['Mobile App']);
    expect(headings(2)).toEqual(HEADINGS);
    expect(headings(3)).toEqual(CARDS);
  });

  it('sends its one action to the Mac app download', () => {
    const { container } = renderBody(MobilePage, 'mobile');
    const links = container.querySelectorAll('a');
    expect(links).toHaveLength(1);
    expect(screen.getByRole('link', { name: 'Start with the Mac app' })).toHaveAttribute(
      'href',
      '#download'
    );
  });

  it('says it in its own words, and nothing it may not say', () => {
    const { container } = renderBody(MobilePage, 'mobile');
    for (const line of [
      'The Orqanix app for your phone. Check your work, run it again or start something new. Your Mac does the work.',
      'Your phone is a remote for Orqanix on your Mac. Everything runs on the Mac, with its files, tools and settings. The phone shows you what is happening and lets you give the next job.',
      'Follow each step of a running job and read the result when it’s done.',
      'Type or say what you need. Your Mac starts the work straight away.',
      'The phone is the remote, your Mac is the engine. When Orqanix is open on your Mac, the phone is live. When the Mac sleeps or goes offline, the phone tells you and waits until it’s back.',
      'The files are made on your Mac and stay in your project folder. Your phone shows what was made, and your Mac keeps the originals.',
      'Everything is waiting in the Workspace when you get back.',
    ]) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
    const text = SOON_OK(container).textContent;
    expect(text).not.toMatch(BANNED);
    expect(text).not.toMatch(BRANDS);
    expect(text).not.toMatch(STORES);
    expect(text).not.toContain(SOON_LABEL);
    expect(container.querySelector('[data-soon]')).toBeNull();
  });

  it('answers its questions in rows that open one at a time', () => {
    renderBody(MobilePage, 'mobile');
    const rows = screen.getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual(QUESTIONS);
    const answer = screen.getByText(
      'The phone shows that your Mac is offline. Open Orqanix on your Mac and you’re live again.'
    );
    expect(answer).not.toBeVisible();
    const row = screen.getByRole('button', { name: 'What if my Mac is off?' });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(answer).toBeVisible();
    expect(screen.getByText(/add your phone\.$/)).not.toBeVisible();
  });

  it('draws every picture as a cut of its own scene, in a graphite card', () => {
    const { container } = renderBody(MobilePage, 'mobile');
    const stages = [...container.querySelectorAll('.ps')];
    expect(stages.map((stage) => stage.dataset.cut)).toEqual(PAGE_CUTS);
    for (const stage of stages) {
      expect(stage).toHaveAttribute('data-product', 'mobile');
      expect(stage).toHaveAttribute('aria-hidden', 'true');
      expect(stage.closest('.pmo-card')).not.toBeNull();
    }
    expectNoMedia(container);
    expectUniqueIds(container);
  });

  it('keeps its cards on the shared graphite tokens and in monochrome', () => {
    const css = readFileSync(join(HERE, 'MobilePage.css'), 'utf8');
    for (const name of ['pmo-card', 'pmo-tile']) {
      const card = css.match(new RegExp(`\\.${name} \\{([^}]*)\\}`))[1];
      expect(card).toMatch(/background: var\(--oi-app-surface\)/);
      expect(card).toMatch(/border: 1px solid var\(--oi-app-edge\)/);
      // The card's top highlight, white in both looks (theme.css: --oi-lift-rgb).
      expect(card).toMatch(/box-shadow: inset 0 1px 0 rgba\(var\(--oi-lift-rgb\), 0\.16\)/);
    }
    for (const [, hex] of css.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)) {
      const channels = hex.length === 3 ? [...hex] : hex.match(/../g);
      expect(new Set(channels.map((channel) => channel.toLowerCase())).size, `#${hex}`).toBe(1);
    }
  });
});

describe('MobileScene', () => {
  it.each(ALL_CUTS)('draws the %s cut as a silent, safe picture', (cut) => {
    const { container } = render(<MobileScene cut={cut} />);
    const root = container.firstElementChild;
    expect(root).toHaveClass('ps');
    expect(root).toHaveAttribute('data-product', 'mobile');
    expect(root).toHaveAttribute('data-cut', cut);
    expect(root).toHaveAttribute('aria-hidden', 'true');
    expect(container.querySelector('[id]')).toBeNull();
    expect(
      container.querySelector('a, button, input, select, textarea, [tabindex], [contenteditable]')
    ).toBeNull();
    expectNoMedia(container);
    expect(container.querySelector('canvas')).toBeNull();

    const text = root.textContent;
    expect(text).not.toMatch(BANNED);
    expect(text).not.toMatch(BRANDS);
    expect(text).not.toMatch(STORES);
    expect(text).not.toMatch(/download/i);
    // The phone menu plays this scene and bans these pairs in its text.
    expect(text).not.toMatch(/0[1-9]/);
  });

  it('tells the remote story in its own words', () => {
    const { container } = render(<MobileScene />);
    const text = container.textContent;
    for (const words of [
      'Your Mac · Online',
      'Run again',
      'Done · just now',
      'Weekly sales report is ready',
      'Open Orqanix on your Mac',
      'Find new suppliers',
    ]) {
      expect(text).toContain(words);
    }
  });
});

describe('the Mobile App styles', () => {
  const read = (file) => readFileSync(join(HERE, file), 'utf8');
  const header = read('scenes/mobile.css');
  const page = read('scenes/mobile-page.css');
  // Every selector of a rule (keyframe steps and at-rules aside), comments removed.
  const selectors = (css) =>
    css
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '')
      .match(/[^{};]+(?=\{)/g)
      .map((selector) => selector.trim())
      .filter((selector) => !selector.startsWith('@'))
      .flatMap((selector) => selector.split(/,(?![^(]*\))/).map((part) => part.trim()));

  it('scopes every rule to its own scene', () => {
    for (const selector of [...selectors(header), ...selectors(page)]) {
      expect(selector.startsWith("[data-product='mobile']"), selector).toBe(true);
    }
  });

  it('keeps the page cuts out of the header and ships them with the page', () => {
    expect(header).not.toMatch(/data-cut='(check|rerun|start|online)'/);
    expect(page).toMatch(/data-cut='check'/);
    expect(read('MobilePage.jsx')).toContain("import './scenes/mobile-page.css';");
  });

  it('opens every cut on its payoff, and online on the awake Mac', () => {
    // One clock start for all cuts; the page's own parts follow it too.
    expect(header).toMatch(/\.ps-scene \{[^}]*--pmo-at: calc\(var\(--ps-loop\) \* -0\.75\);/);
    expect(page).toMatch(/data-cut='online'\] \.ps-scene \{[^}]*--pmo-at: 0s;/);
    expect(page.match(/animation-delay: var\(--pmo-at\);/g)).toHaveLength(1);
    expect(page).toMatch(
      /\[data-cut='check'\], \[data-cut='start'\]\) \.ps-scene \{\s*--pmo-at: calc\(var\(--ps-loop\) \* -0\.7\);\s*\}/
    );
    // The start card frames its phone like check and rerun: no layout of its own.
    expect(page).not.toMatch(/data-cut='start'\] \.ps-scene/);
  });

  it('types the new job one letter per step', () => {
    const ask = 'Find new suppliers';
    const { container } = render(<MobileScene cut="start" />);
    expect(container.querySelector('.pmo-tp')).toHaveTextContent(ask);
    const steps = [...page.matchAll(/steps\((\d+), end\)/g)].map(([, n]) => Number(n));
    expect(steps).toEqual([ask.length, ask.length]);
  });

  it('moves only transform and opacity', () => {
    for (const css of [header, page]) {
      for (const [, steps] of css.matchAll(/@keyframes [\w-]+ \{((?:[^{}]*\{[^{}]*\})*)\s*\}/g)) {
        for (const [, property] of steps.matchAll(/([a-z-]+):/g)) {
          expect(['opacity', 'transform', 'translate', 'rotate', 'scale']).toContain(property);
        }
      }
    }
  });
});

describe('the Mobile App route', () => {
  it('opens with its body, one h1 and the download block last', async () => {
    const { container } = await renderProductPage(productPath('mobile'));
    const heading = await screen.findByRole('heading', { level: 1 }, { timeout: 4000 });
    expect(heading).toHaveTextContent('Mobile App');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const main = container.querySelector('main');
    expect(main.lastElementChild).toHaveAttribute('id', 'download');
    expect(main.querySelectorAll('#download')).toHaveLength(1);

    const text = mainText(container);
    expect(text).not.toMatch(BRANDS);
    expect(text).not.toMatch(STORES);
    expect(SOON_OK(main.firstElementChild).textContent).not.toMatch(BANNED);
    expectNoMedia(main.firstElementChild);
    expectUniqueIds(container);
  });
});
