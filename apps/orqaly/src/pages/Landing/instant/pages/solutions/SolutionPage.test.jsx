import { describe, expect, it } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import SolutionPage from './SolutionPage';
import Scene from './scenes';
import { SOLUTIONS_MENU, solutionPath } from './solutionsMenu';
import healthcare from './data/healthcare';

const BANNED =
  /\b(planned|beta|soon|coming|shield|soc ?2|verified|production|guaranteed?|slack|telegram|orqaly|axwise)\b|zero hallucination|\d\s*(x|times)\s+faster/i;

const SCENES = {
  chat: {
    kind: 'chat',
    messages: [
      { from: 'you', text: 'Who is left for tomorrow?' },
      { from: 'app', text: 'Six people. Drafts are ready.' },
      { from: 'you', text: 'Show me the first one.' },
    ],
  },
  call: {
    kind: 'call',
    caller: 'Guest, late evening',
    lines: [
      { from: 'caller', text: 'Do you have a table for four?' },
      { from: 'app', text: 'Yes, at eight. Shall I hold it?' },
      { from: 'caller', text: 'Please do.' },
    ],
    outcome: 'Held: table for four',
  },
  doc: {
    kind: 'doc',
    file: 'weekly-brief.md',
    lines: ['Summary', 'What changed', 'What needs you', 'Next steps'],
    note: 'Draft to review',
  },
  table: {
    kind: 'table',
    file: 'stock-report.csv',
    columns: ['Item', 'On hand', 'Status'],
    rows: [
      ['Oak board', 'Forty', 'Fine'],
      ['Steel pin', 'Twelve', 'Low'],
      ['Glue', 'Three', 'Order'],
    ],
  },
  board: {
    kind: 'board',
    lanes: [
      { title: 'To do', cards: ['Call the supplier'] },
      { title: 'Doing', cards: ['Draft the quote', 'Check the stock'] },
      { title: 'Done', cards: ['Send the invoice'] },
    ],
  },
  timeline: {
    kind: 'timeline',
    steps: [
      { label: 'Request read', state: 'done', meta: 'Mon 09:00' },
      { label: 'Plan written', state: 'done' },
      { label: 'Waiting for your answer', state: 'now', meta: 'Needs you' },
      { label: 'Files delivered', state: 'next' },
    ],
  },
  calendar: {
    kind: 'calendar',
    days: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'],
    slots: [
      { day: 0, start: 9, len: 2, label: 'Kickoff', state: 'booked' },
      { day: 2, start: 13, len: 2, label: 'Workshop', state: 'held' },
      { day: 4, start: 15, len: 1, label: 'Open hour', state: 'free' },
    ],
    note: 'Workshop held for the client',
  },
  map: {
    kind: 'map',
    pins: [
      { x: 12, y: 70, label: 'Depot', state: 'done' },
      { x: 48, y: 30, label: 'First drop', state: 'now' },
      { x: 86, y: 60, label: 'Last drop', state: 'next' },
    ],
    note: 'Three stops in order',
  },
  chart: {
    kind: 'chart',
    title: 'Orders by week',
    series: [3, 4, 4, 6, 5, 8],
    bars: [2, 3, 3, 4, 4, 5],
    xLabels: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6'],
    callout: { at: 5, text: 'Best week so far' },
  },
  inbox: {
    kind: 'inbox',
    threads: [
      { from: 'North Mill', subject: 'Delivery moves a day', tag: 'PO 12', state: 'draft' },
      { from: 'Pack Co', subject: 'Order confirmed', tag: 'PO 14', state: 'replied' },
      { from: 'Ink Works', subject: 'Stock check', tag: 'PO 9', state: 'waiting' },
    ],
    draft: {
      to: 'Reply to the mill',
      lines: ['A day later is fine.', 'Please confirm the new date.'],
    },
  },
  graph: {
    kind: 'graph',
    nodes: [
      { label: 'Parent', x: 50, y: 15, role: 'core' },
      { label: 'Left arm', x: 20, y: 55, role: 'node' },
      { label: 'Right arm', x: 80, y: 55, role: 'node' },
      { label: 'Leaf one', x: 35, y: 88, role: 'node' },
      { label: 'Leaf two', x: 65, y: 88, role: 'node' },
    ],
    links: [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 4],
    ],
    highlight: [0, 2, 4],
  },
  tiles: {
    kind: 'tiles',
    title: 'Floor 1',
    cells: [
      { label: '101', state: 'ok', meta: 'Clean' },
      { label: '102', state: 'now', meta: 'Towels' },
      { label: '103', state: 'alert', meta: 'Guest waiting' },
      { label: '104', state: 'ok' },
    ],
    legend: ['Finished', 'On the way', 'Needs a person'],
  },
  paper: {
    kind: 'paper',
    heading: 'Invoice 12',
    to: 'For the studio',
    rows: [
      ['Design', '6 h'],
      ['Build', '9 h'],
      ['Review', '1 h'],
    ],
    total: ['Hours', '16 h'],
    stamp: 'Ready to send',
  },
  clips: {
    kind: 'clips',
    source: 'Long video · 20 min',
    cuts: [
      { label: 'Hook', start: 5, len: 12 },
      { label: 'Story', start: 40, len: 14 },
      { label: 'Ending', start: 78, len: 12 },
    ],
    outputs: ['3 clips', 'Carousel'],
  },
  phone: {
    kind: 'phone',
    title: 'Reminder',
    messages: [
      { from: 'app', text: 'Your visit is tomorrow at 10:00.' },
      { from: 'them', text: 'Can we move it?' },
    ],
    actions: ['Confirm', 'Reschedule'],
  },
};

// Words in a scene that pick a state or a speaker and are never shown as they are.
const SCENE_CODES = [
  ...['you', 'app', 'caller', 'them', 'done', 'now', 'next'],
  ...['booked', 'held', 'free', 'replied', 'draft', 'waiting', 'core', 'node', 'ok', 'alert'],
];

function sceneTexts(scene) {
  const texts = [];
  const collect = (value) => {
    if (typeof value === 'string') texts.push(value);
    else if (value && typeof value === 'object') Object.values(value).forEach(collect);
  };
  const { kind: _kind, ...content } = scene;
  collect(content);
  return texts.filter((text) => !SCENE_CODES.includes(text));
}

function renderPage(data = healthcare) {
  return render(
    <MemoryRouter initialEntries={[solutionPath(data.slug)]}>
      <SolutionPage data={data} />
    </MemoryRouter>
  );
}

describe('SolutionPage', () => {
  it('opens with the title, the page tag and the two actions', () => {
    renderPage();
    expect(screen.getByRole('heading', { level: 1, name: healthcare.title })).toBeVisible();
    expect(screen.getByText('Solutions · Healthcare')).toBeVisible();
    expect(screen.getByText(healthcare.subtitle)).toBeVisible();
    const hero = screen.getByRole('heading', { level: 1 }).closest('section');
    expect(within(hero).getByRole('link', { name: 'Download for macOS' })).toHaveAttribute(
      'href',
      '#download'
    );
    expect(within(hero).getByRole('link', { name: 'See how it works' })).toHaveAttribute(
      'href',
      '/instant/how-it-works'
    );
  });

  it('shows the four pillars with their body and stat', () => {
    const { container } = renderPage();
    const cells = container.querySelectorAll('.osl-band > li');
    expect(cells).toHaveLength(4);
    healthcare.pillars.forEach((pillar, index) => {
      const cell = within(cells[index]);
      expect(cell.getByRole('heading', { level: 3, name: pillar.title })).toBeVisible();
      expect(cell.getByText(pillar.body)).toBeVisible();
      expect(cell.getByText(pillar.stat)).toBeVisible();
    });
  });

  it('shows the four spotlights with their bullets and scene', () => {
    renderPage();
    const articles = screen.getAllByRole('article');
    expect(articles).toHaveLength(4);
    healthcare.spotlights.forEach((spotlight, index) => {
      const article = within(articles[index]);
      expect(article.getByRole('heading', { level: 2, name: spotlight.title })).toBeVisible();
      expect(article.getByText(spotlight.body)).toBeVisible();
      expect(article.getAllByRole('listitem').map((item) => item.textContent)).toEqual(
        expect.arrayContaining(spotlight.bullets)
      );
      for (const text of sceneTexts(spotlight.scene)) {
        expect(article.getByText(text)).toBeInTheDocument();
      }
    });
  });

  it('opens on the third job, so the first spotlight below is a new picture', () => {
    const { container } = renderPage();
    const opening = within(container.querySelector('.osl-hv'));
    const [first, , third] = healthcare.spotlights;
    expect(third.scene.kind).not.toBe(first.scene.kind);
    for (const text of sceneTexts(third.scene)) {
      expect(opening.getByText(text)).toBeInTheDocument();
    }
    expect(opening.queryByText(sceneTexts(first.scene)[0])).not.toBeInTheDocument();
  });

  it('lists the six agents under their heading', () => {
    const { container } = renderPage();
    expect(screen.getByRole('heading', { level: 2, name: healthcare.agentsTitle })).toBeVisible();
    const cells = container.querySelectorAll('.osl-mosaic > li');
    expect(cells).toHaveLength(6);
    healthcare.agents.forEach((agent, index) => {
      expect(within(cells[index]).getByRole('heading', { name: agent.name })).toBeVisible();
      expect(within(cells[index]).getByText(agent.line)).toBeVisible();
    });
  });

  it('links to the three related pages and to all ten', () => {
    const { container } = renderPage();
    const related = [...container.querySelectorAll('.osl-related-link')];
    expect(related.map((link) => link.getAttribute('href'))).toEqual(
      healthcare.related.map(solutionPath)
    );
    const firstRelated = SOLUTIONS_MENU.find((item) => item.slug === healthcare.related[0]);
    expect(related[0]).toHaveTextContent(firstRelated.label);
    expect(related[0]).toHaveTextContent(firstRelated.line);

    const all = within(screen.getByRole('navigation', { name: 'All solutions' }));
    const links = all.getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual(
      SOLUTIONS_MENU.map((item) => solutionPath(item.slug))
    );
    expect(links).toHaveLength(10);
    expect(all.getByRole('link', { name: 'Healthcare' })).toHaveAttribute('aria-current', 'page');
    expect(all.getAllByRole('link', { current: 'page' })).toHaveLength(1);
  });

  it('ends with the closing line above the unchanged download block', () => {
    const { container } = renderPage();
    const closing = screen.getByText(healthcare.closing);
    const download = container.querySelector('#download');
    expect(download).not.toBeNull();
    expect(
      closing.compareDocumentPosition(download) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(
      within(download).getByRole('heading', { level: 2, name: /Start with the work/ })
    ).toBeInTheDocument();
  });

  it('is built from DOM and inline SVG only, with unique ids and hidden decoration', () => {
    const { container } = renderPage();
    for (const banned of container.querySelectorAll('img, iframe, video, canvas')) {
      expect(banned.closest('[data-orb][aria-hidden="true"]')).not.toBeNull();
    }
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const svg of container.querySelectorAll(
      '.osl-hero svg, .osl-pillars svg, .osl-spots svg'
    )) {
      expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
    }
    expect(container.querySelector('.osl-hv')).toHaveAttribute('aria-hidden', 'true');
  });

  it('never uses a banned word', () => {
    const { container } = renderPage();
    expect(container.textContent).not.toMatch(BANNED);
  });
});

describe('Scene', () => {
  it.each(Object.entries(SCENES))('renders every word of a %s scene', (kind, scene) => {
    const { container } = render(<Scene scene={scene} />);
    expect(container.querySelector(`.osc[data-kind="${kind}"]`)).not.toBeNull();
    for (const text of sceneTexts(scene)) expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('waits for its cue, then plays', () => {
    const { container, rerender } = render(<Scene scene={SCENES.chat} play={false} />);
    expect(container.querySelector('.osc')).toHaveAttribute('data-play', 'false');
    rerender(<Scene scene={SCENES.chat} play />);
    expect(container.querySelector('.osc')).toHaveAttribute('data-play', 'true');
  });

  it('draws nothing for a kind it does not know', () => {
    const { container } = render(<Scene scene={{ kind: 'hologram' }} />);
    expect(container).toBeEmptyDOMElement();
  });
});
