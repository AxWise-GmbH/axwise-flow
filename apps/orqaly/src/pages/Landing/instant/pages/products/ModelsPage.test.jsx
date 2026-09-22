import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, screen, within } from '@testing-library/react';
import ModelsPage from './ModelsPage';
import ModelsScene from './scenes/ModelsScene';
import { NAV_PRODUCTS, SOON_LABEL, productPath } from './productsMenu';
import {
  BANNED,
  SOON_OK,
  expectNoMedia,
  expectUniqueIds,
  mainText,
  renderBody,
  renderProductPage,
} from './testUtils';

const SLUG = 'personalised-models';
const MAIL = 'mailto:hello@orqanix.com?subject=Personalised%20Models';
const HEADINGS = ['What it will do', 'How it will work', 'Want to be first?', 'Questions'];
const LEDE =
  'A model trained on how your business works: your documents, your words and your way of doing things. It will run inside Orqanix, next to the models you already use.';

// The h2 by its name, and the section it heads.
const section = (name) => screen.getByRole('heading', { level: 2, name }).closest('section');

afterEach(cleanup);

describe('ModelsPage', () => {
  it('names the product in its one h1, under the Coming soon pill, then the lead', () => {
    renderBody(ModelsPage, SLUG);
    const h1 = screen.getAllByRole('heading', { level: 1 });
    expect(h1).toHaveLength(1);
    expect(h1[0]).toHaveTextContent('Personalised Models');

    const pill = h1[0].previousElementSibling;
    expect(pill).toHaveAttribute('data-soon');
    expect(pill).toHaveTextContent(SOON_LABEL);

    const lede = h1[0].nextElementSibling;
    expect(lede.textContent.replace(/\s+/g, ' ').trim()).toBe(LEDE);
  });

  it('keeps its own calm order, with a paragraph right under the heads that have one', () => {
    renderBody(ModelsPage, SLUG);
    expect(screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent)).toEqual(
      HEADINGS
    );
    expect(screen.getAllByRole('heading', { level: 3 }).map((h) => h.textContent)).toEqual([
      'Learns your words',
      'Knows your data',
      'Yours alone',
      'Choose what it learns from',
      'We train your model',
      'Use it in Orqanix',
    ]);

    const will = screen.getByRole('heading', { level: 2, name: 'What it will do' });
    expect(will.nextElementSibling.textContent).toMatch(
      /^General AI models know a lot about the world and little about your company\. A\spersonalised model starts from your own material/
    );
    expect(
      screen.getByText(
        'Answers from what your business knows: products, prices, processes and past work.'
      )
    ).toBeInTheDocument();
  });

  it('lists the three steps in order, numbered for the eye only', () => {
    renderBody(ModelsPage, SLUG);
    const steps = within(section('How it will work')).getAllByRole('listitem');
    expect(steps).toHaveLength(3);
    expect(steps[0].closest('ol')).not.toBeNull();
    expect(steps.map((step) => step.querySelector('[aria-hidden="true"]').textContent)).toEqual([
      '01',
      '02',
      '03',
    ]);
    expect(steps[1]).toHaveTextContent('It learns from that material only.');
  });

  it('asks to be told when it is ready, by mail, under the name and again at the close', () => {
    renderBody(ModelsPage, SLUG);
    const links = screen.getAllByRole('link', { name: "Tell me when it's ready" });
    expect(links).toHaveLength(2);
    for (const link of links) expect(link).toHaveAttribute('href', MAIL);
    expect(screen.getAllByRole('link')).toHaveLength(2);

    const close = section('Want to be first?');
    expect(
      within(close).getByText('Write to us, and we’ll tell you when it’s ready.')
    ).toBeVisible();
    expect(close).toContainElement(links[1]);
  });

  it('answers two questions, each hidden until its row is opened', () => {
    renderBody(ModelsPage, SLUG);
    const rows = within(section('Questions')).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual([
      'When will it be ready?',
      'Is my material shared with anyone?',
    ]);
    for (const row of rows) expect(row).toHaveAttribute('aria-expanded', 'false');

    const answer = screen.getByText('No. It is used only to train your own model.');
    expect(answer).not.toBeVisible();
    fireEvent.click(rows[1]);
    expect(rows[1]).toHaveAttribute('aria-expanded', 'true');
    expect(answer).toBeVisible();
    expect(
      screen.getByText('We’ll post it on the News page and write to everyone who asked.')
    ).not.toBeVisible();
  });

  it('plays the hero cut of its own scene, with Coming soon only on marked pills', () => {
    const { container } = renderBody(ModelsPage, SLUG);
    const stage = container.querySelector('.ps');
    expect(stage).toHaveAttribute('data-product', SLUG);
    expect(stage).toHaveAttribute('data-cut', 'hero');
    expect(stage).toHaveAttribute('aria-hidden', 'true');
    // Two marked pills: the page's own, and the one in the picture.
    expect(container.querySelectorAll('[data-soon]')).toHaveLength(2);
    expect(SOON_OK(container).textContent).not.toMatch(BANNED);
  });

  it.each(['menu', 'hero'])('draws the %s cut: files, ridges, arcs and the label', (cut) => {
    const { container } = renderBody(() => <ModelsScene cut={cut} />, SLUG);
    const stage = container.firstElementChild;
    expect(stage).toHaveAttribute('data-cut', cut);
    expect(stage.querySelectorAll('.ppm-file')).toHaveLength(8);
    // Four ridge groups of three, then the four arcs: each an HTML box around its own SVG, so
    // it turns and fades on the compositor.
    const layers = [...stage.querySelectorAll('.ppm-core > i')];
    expect(layers.map((layer) => layer.querySelectorAll(':scope > svg > ellipse').length)).toEqual([
      3, 3, 3, 3, 1, 1, 1, 1,
    ]);
    expect(within(stage).getByText('Your model')).toBeInTheDocument();
    expect(stage.textContent).not.toMatch(/0[1-9]|download/i);
    expect(stage.querySelector('[id]')).toBeNull();
  });

  it('ships the scene look with the page while the header menu leaves the product out', () => {
    // The header plays only NAV_PRODUCTS. Out of it, the scene's stylesheet rides with this
    // page, off the header's scenes chunk; back in it, the scene must import its own again.
    const here = dirname(fileURLToPath(import.meta.url));
    const source = (file) => readFileSync(join(here, file), 'utf8');
    const inMenu = NAV_PRODUCTS.some((item) => item.slug === SLUG);
    expect(source('scenes/ModelsScene.jsx').includes("import './models.css';")).toBe(inMenu);
    expect(source('ModelsPage.jsx').includes("import './scenes/models.css';")).toBe(!inMenu);
  });

  it('shows its own Coming soon pill on the hero only: the menu row already says it', () => {
    const hero = renderBody(() => <ModelsScene cut="hero" />, SLUG).container;
    expect(hero.querySelector('[data-soon]')).toHaveTextContent(SOON_LABEL);
    const menu = renderBody(() => <ModelsScene cut="menu" />, SLUG).container;
    expect(menu.querySelector('[data-soon]')).toBeNull();
    expect(menu.textContent).not.toContain(SOON_LABEL);
  });

  it('holds together inside the whole product page', async () => {
    const { container } = await renderProductPage(productPath(SLUG));
    await screen.findByRole('heading', { level: 1 }, { timeout: 4000 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);

    const text = SOON_OK(container.querySelector('main')).textContent;
    expect(text).not.toMatch(BANNED);
    expect(mainText(container)).not.toMatch(/Orqaly|AxWise|orqaly-axwise|x-axwise/i);
    expect(mainText(container, { spokenOnly: true })).not.toMatch(/Orqaly|AxWise/i);
    expectNoMedia(container);
    expectUniqueIds(container);

    // The download block closes the page, after this page's own sections.
    const h2 = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent);
    expect(h2.slice(0, HEADINGS.length)).toEqual(HEADINGS);
    expect(container.querySelector('main').lastElementChild).toHaveAttribute('id', 'download');
  });
});
