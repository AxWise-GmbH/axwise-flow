import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import EnterprisePage from './EnterprisePage';
import EnterpriseScene from './scenes/EnterpriseScene';
import { SOON_LABEL, findProduct, productPath } from './productsMenu';
import {
  BANNED,
  SOON_OK,
  expectNoMedia,
  expectUniqueIds,
  mainText,
  renderBody,
  renderProductPage,
} from './testUtils';

// The page's own order: a services page, laid out apart from the other five products.
const HEADINGS = [
  'Three ways to work with us',
  'What we build',
  'How it runs',
  'More ways we help',
  'Ways to pay',
  'Your rules',
  'Questions',
  'Tell us what you want to automate.',
];
const CARDS = [
  'Hire our AI agents',
  'Hire our specialists',
  'Advice first',
  'Automate a business unit',
  'Pipelines made for you',
  'New roles',
  'Hand existing roles to AI',
  'Discover',
  'Blueprint',
  'Build',
  'Launch',
  'Run & improve',
  'AI readiness audit',
  'Pilot in a few weeks',
  'Custom connectors',
  'Managed agent operations',
  'Team training',
  'White-label reasoning API',
  'Project',
  'Monthly',
  'Per result',
  'Approvals',
  'Roles and access',
  'A clear record',
];
const QUESTIONS = [
  'Where do we start?',
  'Do you replace our team?',
  'Can you work with our systems?',
  'How much does it cost?',
  'Can we get early access to Personalised Models?',
];
const LEAD =
  'Your business, run by AI agents and the people who build them. We plan it with you, build it, and keep it running.';
const MAIL = 'mailto:hello@orqanix.com?subject=Enterprise';
const PAGE_CUTS = ['hero', 'unit', 'pipeline', 'roles', 'replace'];
const ALL_CUTS = ['menu', ...PAGE_CUTS];
// No client names, customer counts, certifications or promises the offer cannot keep.
const CLAIMS = /24\/7|certified|ISO ?\d|customers|clients like|trusted by|\d+\+/i;
const HERE = dirname(fileURLToPath(import.meta.url));

afterEach(cleanup);

function headings(level) {
  return screen.getAllByRole('heading', { level }).map((heading) => heading.textContent);
}

describe('EnterprisePage', () => {
  it('has one h1, the product name, and its own sections in order', () => {
    renderBody(EnterprisePage, 'enterprise');
    expect(headings(1)).toEqual(['Enterprise']);
    expect(headings(2)).toEqual(HEADINGS);
    expect(headings(3).map((title) => title.replace(/\s*↗$/, ''))).toEqual(CARDS);
  });

  it('leads with the owner’s line and asks for a talk by mail, twice', () => {
    const { container } = renderBody(EnterprisePage, 'enterprise');
    expect(screen.getByText(LEAD)).toBeInTheDocument();
    const talks = screen.getAllByRole('link', { name: 'Talk to our team' });
    expect(talks).toHaveLength(2);
    for (const talk of talks) expect(talk).toHaveAttribute('href', MAIL);
    // It ends on its own panel, the last section, with no second rule over it: the site's
    // download block comes next and must not read as its twin.
    const end = container.querySelector('section.pen-end');
    expect(end).toBe(container.querySelector('section:last-of-type'));
    expect(end).not.toHaveClass('ois-ruled');
    expect(end).toContainElement(talks[1]);
  });

  it('opens the API page from the white-label offer, and links nowhere else', () => {
    const { container } = renderBody(EnterprisePage, 'enterprise');
    expect(screen.getByRole('link', { name: 'White-label reasoning API' })).toHaveAttribute(
      'href',
      productPath('api')
    );
    const hrefs = [...container.querySelectorAll('a')].map((link) => link.getAttribute('href'));
    expect(hrefs.sort()).toEqual([MAIL, MAIL, productPath('api')].sort());
  });

  it('says it in the owner’s words, and nothing it may not say', () => {
    const { container } = renderBody(EnterprisePage, 'enterprise');
    for (const line of [
      'Pick the way that fits your team. You can start with advice and build later.',
      'Our agents build your solution inside Orqanix: the plan, the tools and the files. Fast, and ready to change.',
      'Routine roles move to agents. Your people lead, review and approve.',
      'A written plan: what agents do, what people do, and what it will change.',
      'We connect Orqanix to your CRM, ERP, inbox or in-house tools.',
      'Pay for completed tasks or for roles handed to AI.',
      'Let agents run, or approve each step: Allow Once, Always Allow or Deny.',
    ]) {
      expect(screen.getByText(line)).toBeInTheDocument();
    }
    const text = SOON_OK(container).textContent;
    expect(text).not.toMatch(BANNED);
    expect(text).not.toMatch(CLAIMS);
    expect(text).not.toContain(SOON_LABEL);
    expect(container.querySelector('[data-soon]')).toBeNull();
  });

  it('answers its questions in rows that open one at a time', () => {
    const { container } = renderBody(EnterprisePage, 'enterprise');
    // The rows are numbered by the stylesheet, outside each button and hidden from speech.
    expect(container.querySelector('.ois-faq-index')).toBeNull();
    expect(readFileSync(join(HERE, 'EnterprisePage.css'), 'utf8')).toMatch(
      /\.pen-faq \.ois-faq-row::before \{[^}]*content: '0' counter\(pen-q\) \/ '';[^}]*counter-increment: pen-q;/
    );
    const rows = screen.getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual(QUESTIONS);
    const answer = screen.getByText(
      'No. Agents take the routine work. Your people lead, review and decide.'
    );
    expect(answer).not.toBeVisible();
    const row = screen.getByRole('button', { name: 'Do you replace our team?' });
    expect(row).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(row);
    expect(row).toHaveAttribute('aria-expanded', 'true');
    expect(answer).toBeVisible();
    expect(screen.getByText(/or a small pilot\.$/)).not.toBeVisible();
  });

  it('draws every picture as a cut of its own scene, in a graphite card', () => {
    const { container } = renderBody(EnterprisePage, 'enterprise');
    const stages = [...container.querySelectorAll('.ps')];
    expect(stages.map((stage) => stage.dataset.cut)).toEqual(PAGE_CUTS);
    for (const stage of stages) {
      expect(stage).toHaveAttribute('data-product', 'enterprise');
      expect(stage).toHaveAttribute('aria-hidden', 'true');
      expect(stage.closest('.pen-art, .pen-build li')).not.toBeNull();
    }
    expectNoMedia(container);
    expectUniqueIds(container);
  });

  it('keeps its cards on the shared graphite tokens and in monochrome', () => {
    const css = readFileSync(join(HERE, 'EnterprisePage.css'), 'utf8');
    const card = css.match(/\.pen-art \{([^}]*)\}/)[1];
    expect(card).toMatch(/background: var\(--oi-app-surface\)/);
    expect(card).toMatch(/border: 1px solid var\(--oi-app-edge\)/);
    // The card's top highlight, white in both looks (theme.css: --oi-lift-rgb).
    expect(card).toMatch(/box-shadow: inset 0 1px 0 rgba\(var\(--oi-lift-rgb\), 0\.16\)/);
    for (const [, hex] of css.matchAll(/#([0-9a-f]{3}|[0-9a-f]{6})\b/gi)) {
      const channels = hex.length === 3 ? [...hex] : hex.match(/../g);
      expect(new Set(channels.map((channel) => channel.toLowerCase())).size, `#${hex}`).toBe(1);
    }
  });

  it('carries the menu line the owner gave it, with no pill', () => {
    expect(findProduct('enterprise')).toEqual({
      slug: 'enterprise',
      label: 'Enterprise',
      line: 'Our agents and experts build it for you',
    });
  });
});

describe('EnterpriseScene', () => {
  it.each(ALL_CUTS)('draws the %s cut as a silent, safe picture', (cut) => {
    const { container } = render(<EnterpriseScene cut={cut} />);
    const root = container.firstElementChild;
    expect(root).toHaveClass('ps', 'pen-s');
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
    expect(text).not.toMatch(/download/i);
    // The phone menu plays this scene and bans these pairs in its text.
    expect(text).not.toMatch(/0[1-9]/);
  });

  it('tells Blueprint, Build and Run in a few words', () => {
    const { container } = render(<EnterpriseScene />);
    const text = container.textContent;
    for (const words of [
      'Sales',
      'Finance',
      'Support',
      'Operations',
      'Leads',
      'Quotes',
      'Invoices',
      'Automated',
      'New role',
      'Procurement agent',
      'Handed to AI',
    ]) {
      expect(text).toContain(words);
    }
    expect(container.querySelectorAll('.pen-unit')).toHaveLength(4);
    expect(container.querySelectorAll('.pen-orbs i')).toHaveLength(12);
    // The role that is handed over shows a person first, then an agent.
    const face = container.querySelector('.pen-hand .pen-face');
    expect([...face.children].map((icon) => icon.dataset.i)).toEqual(['user', 'bot']);
  });

  it('gives each page cut its own beat', () => {
    const parts = (cut) => render(<EnterpriseScene cut={cut} />).container;
    expect(parts('unit').querySelectorAll('.pen-unit, .pen-boss .ps-tick')).toHaveLength(2);
    expect(parts('pipeline').querySelectorAll('.pen-st')).toHaveLength(4);
    expect(parts('roles').querySelectorAll('.pen-made li')).toHaveLength(3);
    expect(parts('replace').querySelector('.pen-hand .ps-chip')).toHaveTextContent('Handed to AI');
    expect(parts('hero').querySelectorAll('.pen-unit')).toHaveLength(4);
  });
});

// The stylesheets, read from disk (the test runner hands CSS imports over empty).
const SCENES = join(HERE, 'scenes');
const css = (dir, file) => readFileSync(join(dir, file), 'utf8');
const HEADER_CSS = css(SCENES, 'enterprise.css');
const CUTS_CSS = css(SCENES, 'enterprise-page.css');
const PAGE_CSS = css(HERE, 'EnterprisePage.css');
const SCENE_JSX = css(SCENES, 'EnterpriseScene.jsx');
const PAGE_JSX = css(HERE, 'EnterprisePage.jsx');
const KEYFRAMES = /@keyframes ([\w-]+)\s*\{(?:[^{}]*\{[^{}]*\})*[^{}]*\}/g;
const SECTION_IDS = ['ways', 'build', 'runs', 'more', 'pay', 'rules', 'faq', 'end'];

/** Every selector of a stylesheet, split at its top-level commas; comments and keyframes left out. */
function selectors(text) {
  return text
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(KEYFRAMES, '')
    .match(/[^{};]+(?=\{)/g)
    .map((selector) => selector.trim())
    .filter((selector) => !selector.startsWith('@'))
    .flatMap((selector) => selector.split(/,(?![^(]*\))/).map((part) => part.trim()));
}

const keyframeNames = (text) => [...text.matchAll(/@keyframes ([\w-]+)/g)].map((match) => match[1]);
const fontSizes = (text) => [...text.matchAll(/font-size:\s*([^;]+);/g)].map((match) => match[1]);

describe('Enterprise scene styles', () => {
  it('scopes every rule to parts only this scene draws, so it reaches no other product', () => {
    const parts = new Set(SCENE_JSX.match(/pen-[a-z]+/g));
    const blocks = new Set([
      ...PAGE_JSX.match(/pen-[a-z]+/g),
      ...SECTION_IDS.map((id) => `pen-${id}`),
    ]);
    expect([...parts].filter((name) => blocks.has(name))).toEqual([]);
    for (const selector of [...selectors(HEADER_CSS), ...selectors(CUTS_CSS)]) {
      const first = selector.match(/^\.ps\[data-product='enterprise'\]|^\.(pen-[a-z]+)/);
      expect(first, selector).not.toBeNull();
      if (first[1]) expect(parts.has(first[1]), selector).toBe(true);
      // A cut is only ever named on this scene's own stage.
      if (selector.includes('[data-cut=')) {
        expect(selector).toMatch(/^\.pen-s(\[data-cut=|:is\(\[data-cut=)/);
      }
    }
    // The page's own stylesheet styles its blocks and never reaches into a scene.
    for (const selector of selectors(PAGE_CSS)) {
      expect(selector).not.toMatch(/\.ps(?![\w-])|\.ps-(?!icon\b)|data-cut|data-product/);
      for (const [name] of selector.matchAll(/pen-[a-z]+/g))
        expect(blocks, selector).toContain(name);
    }
  });

  it('keeps the page cuts out of the header chunk and loads them with the page', () => {
    expect(HEADER_CSS).not.toMatch(/data-cut='(unit|pipeline|roles|replace)'/);
    expect(HEADER_CSS).not.toMatch(/\.pen-(boss|rail|st|done)\b/);
    for (const selector of selectors(CUTS_CSS)) {
      expect(selector).toMatch(
        /^(\.pen-s(\[data-cut='(unit|pipeline|roles|replace)'\]|:not\(\.pen-m\)|:is\(\[data-cut='(roles|replace)'\], \[data-cut='(roles|replace)'\]\))|\.pen-(boss|rail|st|done)\b)/
      );
    }
    expect(PAGE_JSX).toContain("import './scenes/enterprise-page.css';");
    expect(SCENE_JSX).not.toMatch(/import '[^']*enterprise-page/);
  });

  it('moves only transforms and opacity, draws no SVG, and names its keyframes apart', () => {
    const frames = [...HEADER_CSS.matchAll(KEYFRAMES), ...CUTS_CSS.matchAll(KEYFRAMES)];
    expect(frames.length).toBeGreaterThan(40);
    for (const [block, name] of frames) {
      for (const [, property] of block.slice(block.indexOf('{')).matchAll(/([a-z-]+)\s*:/g)) {
        expect(
          ['opacity', 'transform', 'translate', 'scale', 'animation-timing-function'],
          name
        ).toContain(property);
      }
    }
    expect(`${HEADER_CSS}${CUTS_CSS}`).not.toMatch(/stroke|background-position/);
    for (const cut of ALL_CUTS) {
      expect(render(<EnterpriseScene cut={cut} />).container.querySelector('svg')).toBeNull();
    }
    const own = [
      ...keyframeNames(HEADER_CSS),
      ...keyframeNames(CUTS_CSS),
      ...keyframeNames(PAGE_CSS),
    ];
    expect(new Set(own).size).toBe(own.length);
    const elsewhere = [
      ...readdirSync(HERE)
        .filter((file) => file.endsWith('.css') && file !== 'EnterprisePage.css')
        .map((file) => css(HERE, file)),
      ...readdirSync(SCENES)
        .filter((file) => file.endsWith('.css') && !file.startsWith('enterprise'))
        .map((file) => css(SCENES, file)),
    ].flatMap(keyframeNames);
    expect(own.filter((name) => elsewhere.includes(name))).toEqual([]);
  });

  it('draws every word of the story at 1.6u or more, and at 9px or more on a phone', () => {
    const [wide, narrow] = HEADER_CSS.replace(KEYFRAMES, '').split(
      '@container ps (max-width: 480px)'
    );
    expect(wide).not.toMatch(/\bfont:/);
    expect(fontSizes(wide).length).toBeGreaterThan(5);
    for (const size of fontSizes(wide)) {
      expect(
        Number(size.match(/^calc\(var\(--u\) \* ([\d.]+)\)$/)?.[1]),
        size
      ).toBeGreaterThanOrEqual(1.6);
    }
    const small = [
      ...fontSizes(narrow),
      ...fontSizes(CUTS_CSS.replace(KEYFRAMES, '').split('@container').slice(1).join('')),
    ];
    expect(small.length).toBeGreaterThan(8);
    for (const size of small) expect(size).toMatch(/^max\(9px, calc\(var\(--u\) \* [\d.]+\)\)$/);
  });

  it('opens the menu on the finished frame and holds it, and the page top on the running units', () => {
    for (const cut of ['menu', 'hero']) {
      expect(render(<EnterpriseScene cut={cut} />).container.firstElementChild).toHaveClass(
        'pen-m'
      );
    }
    for (const cut of PAGE_CUTS.slice(1)) {
      expect(render(<EnterpriseScene cut={cut} />).container.firstElementChild).not.toHaveClass(
        'pen-m'
      );
    }
    const frames = Object.fromEntries(
      [...HEADER_CSS.matchAll(KEYFRAMES)].map(([block, name]) => [name, block])
    );
    const flat = (body) => body.replace(/\s+/g, ' ').trim();
    for (const name of ['pen-fill', 'pen-orb', 'pen-flow', 'pen-flowon', 'pen-on', 'pen-made']) {
      const stops = [...frames[name].matchAll(/([\d.%,\s]+)\{([^{}]*)\}/g)].map(([, at, body]) => [
        at.split(',').map(parseFloat),
        flat(body),
      ]);
      const [[firstAt, first], [lastAt, last]] = [stops[0], stops.at(-1)];
      expect(firstAt[0], name).toBe(0);
      expect(Math.max(...firstAt), name).toBeGreaterThanOrEqual(12);
      expect(lastAt.at(-1), name).toBe(100);
      expect(first, name).toBe(last);
    }

    // Every animation on the story's clock starts at var(--pen-t), so each cut picks where it opens.
    const blocks = (text) =>
      text
        .replace(/\/\*[\s\S]*?\*\//g, '')
        .replace(KEYFRAMES, '')
        .match(/[^{}]+\{[^{}]*\}/g);
    for (const block of [...blocks(HEADER_CSS), ...blocks(CUTS_CSS)]) {
      if (/animation:[^;]*var\(--ps-loop\)/.test(block)) expect(block).toContain('var(--pen-t)');
    }
    const start = (text, rule) =>
      Number(
        text.match(
          new RegExp(`${rule} \\{\\s*--pen-t: calc\\(var\\(--ps-loop\\) \\* -([\\d.]+)\\);`)
        )[1]
      );
    // The menu opens inside the held finished frame (85 % round to 12 %) and holds it 2.5-3 s.
    const menu = start(HEADER_CSS, '\\.pen-m');
    expect(menu).toBeGreaterThanOrEqual(0.85);
    expect((1 - menu + 0.12) * 11).toBeGreaterThanOrEqual(2.5);
    expect((1 - menu + 0.12) * 11).toBeLessThanOrEqual(3.1);
    // The page top opens with the units running (57 %) and the pen gone before the plan (84 %).
    const hero = start(HEADER_CSS, "\\.pen-s\\[data-cut='hero'\\]");
    expect(hero).toBeGreaterThanOrEqual(0.57);
    expect(hero).toBeLessThan(0.84);
    // Each page cut opens part-way into its beat, never on its empty first frame.
    for (const cut of PAGE_CUTS.slice(1)) {
      expect(CUTS_CSS, cut).toMatch(
        new RegExp(
          `\\.pen-s\\[data-cut='${cut}'\\][^{]*\\{\\s*--pen-t: calc\\(var\\(--ps-loop\\) \\* -0\\.[1-9]`
        )
      );
    }
  });
});

describe('the Enterprise route', () => {
  it('opens with its body, one h1 and the download block last', async () => {
    const { container } = await renderProductPage(productPath('enterprise'));
    const heading = await screen.findByRole('heading', { level: 1 }, { timeout: 4000 });
    expect(heading).toHaveTextContent('Enterprise');
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    const main = container.querySelector('main');
    expect(main.lastElementChild).toHaveAttribute('id', 'download');
    expect(main.querySelectorAll('#download')).toHaveLength(1);

    expect(mainText(container)).not.toMatch(/Orqaly|AxWise/i);
    expect(SOON_OK(main.firstElementChild).textContent).not.toMatch(BANNED);
    expectNoMedia(main.firstElementChild);
    expectUniqueIds(container);
  });
});
