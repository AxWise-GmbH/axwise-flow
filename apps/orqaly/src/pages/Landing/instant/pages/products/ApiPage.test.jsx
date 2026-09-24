import { readFileSync } from 'node:fs';
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import ApiPage from './ApiPage';
import ApiScene from './scenes/ApiScene';
import { productPath } from './productsMenu';
import {
  BANNED,
  SOON_OK,
  expectNoMedia,
  expectUniqueIds,
  mainText,
  renderBody,
  renderProductPage,
} from './testUtils';

// The page's own order of sections: this pins its layout apart from the other products.
const HEADINGS = [
  'What comes back',
  'How it works',
  'Use it for',
  'Built for your stack',
  'Want it in your product?',
  'Questions',
];
const PAGE_CUTS = ['hero', 'uses'];
const ACCESS = 'mailto:hello@orqanix.com?subject=API%20access';
const BRANDS = /Orqaly|AxWise|orqaly-axwise|x-axwise/i;
// The real API lives behind a host, a path prefix and a key header that all carry names the
// site never prints. Only the bare paths may show.
const HIDDEN = /api\.axwise\.de|\/api\/orqaly-axwise|x-axwise-key/i;

afterEach(cleanup);

function headings(level) {
  return screen.getAllByRole('heading', { level }).map((heading) => heading.textContent);
}

describe('ApiPage', () => {
  it('has one h1, the product name, and its own sections in order', () => {
    renderBody(ApiPage, 'api');
    expect(headings(1)).toEqual(['API']);
    expect(headings(2)).toEqual(HEADINGS);
  });

  it('says what the API is: the line, then the longer lead', () => {
    renderBody(ApiPage, 'api');
    expect(screen.getByText('Our reasoning layer, inside your product.')).toBeInTheDocument();
    expect(
      screen.getByText(
        'The same reasoning layer that runs inside Orqanix, as an API for your product. Send a task with your agents and tools. Get back who should do it, an agent, a team or a person, with the reasons, checks and fallbacks.',
        { normalizer: (text) => text.replace(/\s+/g, ' ').trim() }
      )
    ).toHaveClass('pap-sub');
  });

  it('puts a short paragraph under each section heading that has one', () => {
    const { container } = renderBody(ApiPage, 'api');
    const lines = [...container.querySelectorAll('.pap-line')].map((line) => [
      line.closest('section').querySelector('h2').textContent,
      line.textContent,
    ]);
    expect(lines).toEqual([
      [
        'What comes back',
        'Every answer is a decision you can act on and explain. It names the best agent, shows the score behind it factor by factor, and lists the context, guardrails and fallbacks that go with the task. For bigger jobs it returns a plan for a small team of agents.',
      ],
      ['Use it for', 'Anywhere a task has to reach the right hands.'],
      [
        'Built for your stack',
        'A plain REST API: JSON in, JSON out, with an API key. Long jobs answer at once and finish in the background; poll for the result or get a signed webhook.',
      ],
      [
        'Want it in your product?',
        'Write to us and we’ll set you up with a key and help with the first calls.',
      ],
    ]);
  });

  it('walks through a call in three numbered steps', () => {
    renderBody(ApiPage, 'api');
    const how = screen.getByRole('region', { name: 'How it works' });
    const steps = within(how).getAllByRole('listitem');
    expect(steps[0].closest('ol')).not.toBeNull();
    expect(
      within(how)
        .getAllByRole('heading', { level: 3 })
        .map((title) => title.textContent)
    ).toEqual(['Send the task', 'It picks a route', 'You run the work']);
    expect(steps[1]).toHaveTextContent(
      'Every candidate is scored. The route can be direct, with research, with a person, or as a team.'
    );
    for (const step of steps) expect(step).toHaveClass('pap-card');
  });

  it('answers four questions, each hidden until its row is opened', () => {
    renderBody(ApiPage, 'api');
    const faq = screen.getByRole('region', { name: 'Questions' });
    const rows = within(faq).getAllByRole('button');
    expect(rows.map((row) => row.textContent)).toEqual([
      'Who is it for?',
      'Does the API run the work?',
      'How do I get access?',
      'What does it cost?',
    ]);
    const answer =
      'No. It decides and explains. Your system keeps control of access, approvals and running the work.';
    expect(screen.getByText(answer)).not.toBeVisible();
    fireEvent.click(rows[1]);
    expect(rows[1]).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(answer)).toBeVisible();
    expect(rows[0]).toHaveAttribute('aria-expanded', 'false');
  });

  it('asks for access by mail and links the story', () => {
    renderBody(ApiPage, 'api');
    const access = screen.getAllByRole('link', { name: 'Get API access' });
    expect(access).toHaveLength(2);
    for (const link of access) expect(link).toHaveAttribute('href', ACCESS);
    expect(screen.getByRole('link', { name: /Read the story/ })).toHaveAttribute(
      'href',
      '/instant/news/business-api'
    );
  });

  it('shows the real response, its field names and what each part is for', () => {
    const { container } = renderBody(ApiPage, 'api');
    const code = container.querySelector('pre code');
    const text = code.textContent;
    for (const field of [
      '"routing_mode": "direct"',
      '"status": "recommended"',
      '"confidence": 0.84',
      '"recommended_agents": [{',
      '"rank": 1',
      '"agent_name": "Support Specialist"',
      '"score": 0.84',
      '"factor": "required_capability_coverage"',
      '"reason": "covers 1/1 required capabilities"',
      '"Revalidate ownership, availability, permissions, budget, and tool scope before execution"',
      '"trigger": "agent_unavailable"',
      '"action": "request_new_catalogue"',
      '"execution_plan": {',
      '"executable": true',
    ]) {
      expect(text).toContain(field);
    }
    const callouts = [...code.querySelectorAll('.pap-call')].map((call) =>
      call.textContent.replace(/\s+/g, ' ')
    );
    expect(callouts).toEqual([
      'Who recommended_agents The best agent, team or person for the task, ranked.',
      'Why factors[].reason A score for each factor: skills, tools, success rate, cost and speed.',
      'With what context_packages, guardrails, fallbacks The context to pass on, the guardrails to keep, and what to do if something fails.',
      'Team plan execution_plan.nodes Steps, owners and hand-offs when one agent is not enough.',
    ]);
  });

  it('builds its response on the hero code, so both name the same agent', () => {
    const hero = render(<ApiScene cut="hero" />).container;
    const spine = [...hero.querySelectorAll('.pap-res p')].map((line) => line.textContent.trim());
    expect(spine).toContain('"agent_name": "Support Specialist",');
    cleanup();
    const { container } = renderBody(ApiPage, 'api');
    const page = [...container.querySelectorAll('.pap-ln')].map((line) =>
      line.textContent.replace(line.querySelector('.pap-call')?.textContent ?? '', '').trim()
    );
    // Every hero line up to the agent's closing bracket is in the page, in the same order.
    let at = -1;
    for (const line of spine.slice(0, 7)) {
      const next = page.findIndex((row, index) => index > at && row.startsWith(line));
      expect(next, line).toBeGreaterThan(at);
      at = next;
    }
    // One agent name wherever it shows: the hero, the uses cut's markup and the response.
    const names = [...mainText(container).matchAll(/"agent_name": "([^"]+)"/g)].map((m) => m[1]);
    expect(new Set(names)).toEqual(new Set(['Support Specialist']));
  });

  it('lists the seven worked examples and the five stack facts', () => {
    renderBody(ApiPage, 'api');
    const uses = screen.getByRole('region', { name: 'Use it for' });
    expect(
      within(uses)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual([
      'Software incidents',
      'Customer escalations',
      'Compliance reviews',
      'Marketing prep',
      'Finance analysis',
      'Research',
      'Multi-agent plans',
    ]);
    const stack = screen.getByRole('region', { name: 'Built for your stack' });
    expect(
      within(stack)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual([
      'REST + JSON',
      'API key',
      'Safe retries',
      'OpenAPI docs',
      'Webhook when long work ends',
    ]);
  });

  it('never prints a banned word, a brand name, the host or the key header', () => {
    const { container } = renderBody(ApiPage, 'api');
    // The closed answers are in the DOM (hidden), so their text is checked here too.
    expect(container.querySelectorAll('.oi-more-region[hidden]')).toHaveLength(4);
    const text = SOON_OK(container).textContent;
    expect(text).not.toMatch(BANNED);
    expect(text).not.toMatch(BRANDS);
    expect(text).not.toMatch(HIDDEN);
    expect(container.querySelector('[data-soon]')).toBeNull();
    for (const link of container.querySelectorAll('a')) {
      expect(link.getAttribute('href')).not.toMatch(/axwise|orqaly/i);
    }
  });

  it('draws its pictures as cuts of the API scene, with no media and unique ids', () => {
    const { container } = renderBody(ApiPage, 'api');
    const stages = [...container.querySelectorAll('.ps')];
    expect(stages.map((stage) => stage.dataset.cut)).toEqual(PAGE_CUTS);
    for (const stage of stages) {
      expect(stage).toHaveAttribute('data-product', 'api');
      expect(stage).toHaveAttribute('aria-hidden', 'true');
      expect(stage.closest('.pap-card')).not.toBeNull();
    }
    expectNoMedia(container);
    expectUniqueIds(container);
  });

  it.each(['menu', 'hero', 'uses'])('draws the %s cut with the real call', (cut) => {
    const { container } = render(<ApiScene cut={cut} />);
    const stage = container.firstElementChild;
    expect(stage).toHaveAttribute('data-cut', cut);
    const text = stage.textContent;
    expect(text).toContain('POST /orchestration/decisions');
    expect(text).toContain('"routing_mode": "direct"');
    expect(text).toContain('"recommended_agents": [{');
    expect(text).not.toMatch(HIDDEN);
    expect(text).not.toMatch(BRANDS);
    // The status code is drawn by CSS: the phone menu bans these pairs in its text.
    expect(text).not.toMatch(/0[1-9]/);
    expect(container.querySelector('[id], a, button, img, video, iframe, canvas')).toBeNull();
  });

  it('opens as the API product page', async () => {
    const { container } = await renderProductPage(productPath('api'));
    expect(await screen.findByRole('heading', { level: 1 }, { timeout: 4000 })).toHaveTextContent(
      'API'
    );
    const text = mainText(container);
    expect(text).not.toMatch(HIDDEN);
    expect(text).not.toMatch(BRANDS);
    expectUniqueIds(container);
  });
});

// The runner hands CSS imports over empty, so the scene's stylesheets are read from disk.
const read = (path) => readFileSync(new URL(path, import.meta.url), 'utf8');

/** Every selector of a stylesheet, keyframes and comments left out. */
function selectors(css) {
  const rules = css
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/@keyframes[^{]*\{(?:[^{}]*\{[^{}]*\})*\s*\}/g, '');
  return [...rules.matchAll(/([^{};]+)\{/g)]
    .map((match) => match[1].trim())
    .filter((selector) => !selector.startsWith('@'))
    .flatMap((selector) => selector.split(',').map((part) => part.trim()));
}

describe('API scene styles', () => {
  const header = read('./scenes/api.css');
  const page = read('./scenes/api-page.css');

  it.each([
    ['api.css', header],
    ['api-page.css', page],
  ])('%s touches only the API scene', (_, css) => {
    const all = selectors(css);
    expect(all.length).toBeGreaterThan(20);
    for (const selector of all) {
      // Scoped by the product, or by a class only this scene uses.
      expect(selector, selector).toMatch(/\[data-product='api'\]|\.pap-/);
      if (selector.includes('[data-cut=')) {
        expect(selector, selector).toMatch(/^\[data-product='api'\]\[data-cut='\w+'\]/);
      }
      if (/\.ps-/.test(selector) && !/\.pap-/.test(selector)) {
        expect(selector, selector).toMatch(/^\[data-product='api'\]/);
      }
    }
  });

  it('drops the request on a small hero card and keeps its code at 9px or more', () => {
    const small = page.slice(page.indexOf('@container ps (max-width: 520px)'));
    const rule = (part) => small.match(new RegExp(`${part} \\{([^}]*)\\}`))?.[1] ?? '';
    expect(rule("\\[data-cut='hero'\\] \\.pap-req")).toMatch(/display: none/);
    expect(rule("\\[data-cut='hero'\\] \\.pap-code")).toMatch(/font-size: max\(9px, /);
    // The response and the lanes stay.
    expect(rule("\\[data-cut='hero'\\] \\.pap-res")).not.toMatch(/display: none/);
    expect(rule("\\[data-cut='hero'\\] \\.pap-dia")).not.toMatch(/display: none/);
    expect(page).toMatch(/\.pap-code \{[^}]*font-size: max\(9px, /);
  });

  it('keeps the page-only cuts (hero, uses) off the header path', () => {
    expect(header).not.toMatch(/data-cut='(hero|uses)'|@keyframes pap-[hnu]-/);
    expect(page).toMatch(/data-cut='hero'/);
    expect(page).toMatch(/data-cut='uses'/);
    expect(page).not.toMatch(/data-cut='menu'/);
    expect(read('./ApiPage.jsx')).toMatch(/import '\.\/scenes\/api-page\.css';/);
  });
});
