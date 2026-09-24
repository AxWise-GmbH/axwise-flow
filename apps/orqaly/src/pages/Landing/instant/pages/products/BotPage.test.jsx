import { readFileSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import BotPage from './BotPage';
import { ProductScene } from './scenes';
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
  'Give it a role.',
  'It learns your business.',
  'Contacts from mail and phone, in sync.',
  'Files, documents and images, sorted.',
  'Many bots. Full control.',
  'What a bot can do',
  'Questions',
];
const PAGE_CUTS = ['hero', 'role', 'map', 'contacts', 'files', 'control'];
const LEDE =
  'An assistant bot is a colleague with one job. Give it a role, and it collects what it needs, keeps your contacts and files in order, and does the work in Orqanix. Make one for every role you need.';
// The words right under a band's heading: one per band.
const BAND_WORDS = {
  'Give it a role.':
    'A role tells the bot what it is for: sales, finance, support, the office, or anything you write yourself. It follows that role in every task, and you can change it any time.',
  'It learns your business.':
    'The bot builds a map of your business: your team, your clients, your suppliers and your files, and how they connect. The more it works, the better it knows who is who and where things are.',
  'Many bots. Full control.':
    'Make as many bots as you have roles. Each one can use everything the Orqanix app can do: chats, recipes, schedules, tools and files. They work side by side, and you can see what each one did.',
};
const CAN = ['Answer and draft', 'Collect data', 'Keep things in order', 'Run jobs on time'];
const QUESTIONS = [
  'How many bots can I make?',
  'What can a bot do?',
  'Can I change a bot’s role?',
  'Where do the bot’s files go?',
];
const BRANDS = /Orqaly|AxWise|orqaly-axwise|x-axwise/i;
// What each cut must draw: [selector, how many].
const PARTS = {
  menu: [
    ['.pbo-chips .ps-chip', 4],
    ['.pbo-roster .pbo-bot', 3],
    ['.pbo-node', 4],
    ['.pbo-map .pbo-tile', 4],
    ['.pbo-mac .ps-file', 1],
    ['.pbo-cur', 1],
  ],
  hero: [['.pbo-wall .pbo-bot', 12]],
  role: [
    ['.pbo-chips .ps-chip', 4],
    ['.pbo-face', 3],
    ['.pbo-face p', 9],
  ],
  map: [
    ['.pbo-map path', 8],
    ['.pbo-node', 4],
    ['.pbo-hub', 1],
  ],
  contacts: [
    ['.pbo-con .pbo-tile', 2],
    ['.pbo-con path', 2],
    ['.pbo-person', 5],
  ],
  files: [
    ['.pbo-files .pbo-tile', 6],
    ['.pbo-folder', 3],
  ],
  control: [
    ['.pbo-ctl .pbo-bot', 3],
    ['.pbo-pane', 4],
    // Chat, Recipe, Schedule and Files: every pane has its icon.
    ['.pbo-pane > .ps-icon', 4],
    ['.pbo-cur', 1],
  ],
};

// The scene's stylesheets and the page's, read from disk (the test runner hands CSS over empty).
const HERE = dirname(fileURLToPath(import.meta.url));
const read = (...path) => readFileSync(join(HERE, ...path), 'utf8');
const SCENE_CSS = {
  'bot.css': read('scenes', 'bot.css'),
  'bot-page.css': read('scenes', 'bot-page.css'),
};
const PAGE_ONLY_CUTS = ['role', 'map', 'contacts', 'files', 'control'];
const SCOPE = "[data-product='assistant-bot']";

/** Every selector of a stylesheet, keyframe steps left out. */
function selectors(css) {
  let text = css.replace(/\/\*[\s\S]*?\*\//g, '');
  // Drop each @keyframes block, braces and all.
  for (let at = text.indexOf('@keyframes'); at !== -1; at = text.indexOf('@keyframes')) {
    let depth = 0;
    let end = text.indexOf('{', at);
    do {
      if (text[end] === '{') depth += 1;
      if (text[end] === '}') depth -= 1;
      end += 1;
    } while (depth > 0);
    text = text.slice(0, at) + text.slice(end);
  }
  return [...text.matchAll(/([^{};]+)\{/g)]
    .map((match) => match[1].trim())
    .filter((prelude) => !prelude.startsWith('@'))
    .flatMap((prelude) => prelude.split(',').map((selector) => selector.trim()));
}

/** [selector list, body] of every rule outside @keyframes, @container blocks opened up. */
function rules(css) {
  const text = css.replace(/\/\*[\s\S]*?\*\//g, '').replace(/@container[^{]*\{/g, '');
  return [...text.matchAll(/([^{}]+)\{([^{}]*)\}/g)]
    .map((match) => [match[1].trim(), match[2]])
    .filter(([prelude]) => !/^(@|\d|from|to)/.test(prelude));
}

/** The @keyframes names a stylesheet defines. */
const keyframes = (css) => [...css.matchAll(/@keyframes ([\w-]+)/g)].map((match) => match[1]);

afterEach(cleanup);

function headings(level) {
  return screen.getAllByRole('heading', { level }).map((heading) => heading.textContent);
}

describe('BotPage', () => {
  it('has one h1, the product name, and its own sections in order', () => {
    renderBody(BotPage, 'assistant-bot');
    expect(headings(1)).toEqual(['Assistant Bot']);
    expect(headings(2)).toEqual(HEADINGS);
  });

  it('says it in a lead and sends its one action to the download block', () => {
    renderBody(BotPage, 'assistant-bot');
    expect(screen.getByText(LEDE)).toHaveClass('pbo-lede');
    const links = screen.getAllByRole('link');
    expect(links).toHaveLength(1);
    expect(links[0]).toHaveTextContent('Try For Free');
    expect(links[0]).toHaveAttribute('href', '#download');
    // The only other controls are the question rows.
    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(QUESTIONS);
  });

  it('puts its words right under each band heading, and one under each half card title', () => {
    renderBody(BotPage, 'assistant-bot');
    for (const [title, words] of Object.entries(BAND_WORDS)) {
      const heading = screen.getByRole('heading', { level: 2, name: title });
      expect(heading.nextElementSibling).toHaveTextContent(words);
      expect(heading.nextElementSibling.tagName).toBe('P');
    }
    const contacts = screen.getByRole('heading', { name: HEADINGS[2] });
    expect(contacts.nextElementSibling).toHaveTextContent(
      'It gathers people from your email and your phone into one list and merges the duplicates.'
    );
    const files = screen.getByRole('heading', { name: HEADINGS[3] });
    expect(files.nextElementSibling).toHaveTextContent(
      'Invoices, contracts, photos and notes land in the right folder, easy to find later.'
    );
  });

  it('shows what a bot can do in four cards, a title and a sentence each', () => {
    renderBody(BotPage, 'assistant-bot');
    const section = screen.getByRole('heading', { level: 2, name: 'What a bot can do' });
    const cards = within(section.closest('section')).getAllByRole('listitem');
    expect(
      cards.map((card) => within(card).getByRole('heading', { level: 3 }).textContent)
    ).toEqual(CAN);
    for (const card of cards) expect(card.querySelectorAll('p')).toHaveLength(1);
    expect(
      within(cards[3]).getByText('Schedules for the work that repeats every day or week.')
    ).toBeInTheDocument();
  });

  it('answers four questions, each answer hidden until its row is opened', () => {
    renderBody(BotPage, 'assistant-bot');
    const section = screen.getByRole('heading', { level: 2, name: 'Questions' }).closest('section');
    const rows = within(section).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual(QUESTIONS);
    // The row numbers are drawn for the eye only; a screen reader hears the questions.
    expect(section.querySelectorAll('.ois-faq-index')).toHaveLength(QUESTIONS.length);
    expect(spoken(section).textContent).not.toMatch(/0[1-9]/);
    const answer = within(section).getByText(
      'Yes, any time. Edit the role, and the bot follows it from the next task.'
    );
    expect(answer).not.toBeVisible();
    fireEvent.click(within(section).getByRole('button', { name: QUESTIONS[2] }));
    expect(rows[2]).toHaveAttribute('aria-expanded', 'true');
    expect(answer).toBeVisible();
    expect(
      within(section).getByText('Into your Orqanix Workspace, like the files from any other job.')
    ).not.toBeVisible();
  });

  it('draws every picture as a cut of its own scene, with no media and unique ids', () => {
    const { container } = renderBody(BotPage, 'assistant-bot');
    const stages = [...container.querySelectorAll('.ps')];
    expect(stages.map((stage) => stage.dataset.cut)).toEqual(PAGE_CUTS);
    for (const stage of stages) {
      expect(stage).toHaveAttribute('data-product', 'assistant-bot');
      expect(stage).toHaveAttribute('aria-hidden', 'true');
      expect(stage.closest('.pbo-stage')).toHaveAttribute('data-cut', stage.dataset.cut);
    }
    expectNoMedia(container);
    expectUniqueIds(container);
  });

  it.each(Object.keys(PARTS))('draws the %s cut with its parts', (cut) => {
    const { container } = render(<ProductScene slug="assistant-bot" cut={cut} />);
    const root = container.firstElementChild;
    expect(root).toHaveAttribute('data-cut', cut);
    for (const [selector, count] of PARTS[cut]) {
      expect(root.querySelectorAll(selector), selector).toHaveLength(count);
    }
    // A silent picture: nothing to reach, no ids, no media, and words the menus may show.
    expect(
      container.querySelector('a, button, input, select, textarea, [tabindex], [id]')
    ).toBeNull();
    expectNoMedia(container);
    const text = root.textContent;
    expect(text).not.toMatch(BANNED);
    expect(text).not.toMatch(BRANDS);
    expect(text).not.toMatch(/download/i);
    expect(text).not.toMatch(/0[1-9]/);
  });

  it('marks a made file with a tick, not a tiny badge', () => {
    for (const cut of ['menu', 'control']) {
      const { container } = render(<ProductScene slug="assistant-bot" cut={cut} />);
      expect(container.querySelectorAll('.ps-file .ps-tick')).toHaveLength(1);
      expect(container.querySelector('.ps-file-state')).toBeNull();
      cleanup();
    }
  });

  it('prints nothing it may not say on the whole page', async () => {
    const { container } = await renderProductPage(productPath('assistant-bot'));
    expect(await screen.findByRole('heading', { level: 1 })).toHaveTextContent('Assistant Bot');
    const main = container.querySelector('main');
    const body = main.firstElementChild;
    expect(SOON_OK(body).textContent).not.toMatch(BANNED);
    expect(body.querySelector('[data-soon]')).toBeNull();
    expect(mainText(container)).not.toMatch(BRANDS);
    expect(mainText(container)).not.toMatch(/telegram|slack|whatsapp/i);
    expect(main.lastElementChild).toHaveAttribute('id', 'download');
    expectNoMedia(container);
    expectUniqueIds(container);
  });
});

describe('BotPage styles', () => {
  it.each(Object.keys(SCENE_CSS))('%s reaches only the Assistant Bot scene', (file) => {
    for (const selector of selectors(SCENE_CSS[file])) {
      // .pbo-orb is the one opt-in part another scene may reuse; it matches nothing else.
      if (selector === '.pbo-orb') continue;
      expect(selector.startsWith(SCOPE) || selector.startsWith(`.ps${SCOPE}`), selector).toBe(true);
    }
  });

  it('keeps the page-only cuts out of the header chunk and scopes each to its cut', () => {
    const cutOf = (selector) => selector.match(/\[data-cut='(\w+)'\]/)?.[1];
    const baseCuts = new Set(selectors(SCENE_CSS['bot.css']).map(cutOf).filter(Boolean));
    // The header's own cut (its longer loop) and the page hero; nothing else.
    expect([...baseCuts].sort()).toEqual(['hero', 'menu']);
    for (const selector of selectors(SCENE_CSS['bot-page.css'])) {
      expect(PAGE_ONLY_CUTS, selector).toContain(cutOf(selector));
    }
    // The page brings its own cuts' styles; the header never imports them.
    expect(read('BotPage.jsx')).toMatch(/import '\.\/scenes\/bot-page\.css';/);
    expect(read('scenes', 'BotScene.jsx')).not.toMatch(/import '[^']*bot-page\.css'/);
  });

  it('opens role, map and contacts part way into their story, every part on one offset', () => {
    const css = SCENE_CSS['bot-page.css'];
    for (const cut of ['role', 'map', 'contacts']) {
      expect(css).toMatch(
        new RegExp(
          `\\[data-cut='${cut}'\\] \\{\\s*--o: calc\\(var\\(--ps-loop\\) \\* -0\\.\\d+\\);`
        )
      );
      const timed = rules(css).filter(
        ([prelude, body]) =>
          prelude.includes(`[data-cut='${cut}']`) && /animation(-delay)?:(?! none)/.test(body)
      );
      expect(timed.length, cut).toBeGreaterThan(3);
      for (const [prelude, body] of timed) expect(body, prelude).toMatch(/var\(--o\)/);
    }
  });

  it('names every keyframe of its own apart from every other stylesheet', () => {
    const others = [
      ...readdirSync(HERE)
        .filter((file) => file.endsWith('.css'))
        .map((file) => read(file)),
      ...readdirSync(join(HERE, 'scenes'))
        .filter((file) => file.endsWith('.css') && !(file in SCENE_CSS))
        .map((file) => read('scenes', file)),
    ];
    const names = [...keyframes(SCENE_CSS['bot.css']), ...keyframes(SCENE_CSS['bot-page.css'])];
    const elsewhere = others.flatMap(keyframes);
    expect(new Set(names).size).toBe(names.length);
    expect(names.filter((name) => elsewhere.includes(name))).toEqual([]);
    // The page's own keyframes stay unique across the product pages too.
    const page = keyframes(read('BotPage.css'));
    expect(page.filter((name) => names.includes(name))).toEqual([]);
  });
});
