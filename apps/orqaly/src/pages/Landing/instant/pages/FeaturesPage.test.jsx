import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { instantTheme } from '../instantTheme';
import { DEEP_DIVE_IDS, FEATURES } from './features.data';
import FeaturesPage from './FeaturesPage';

function renderPage(entries = ['/']) {
  return render(
    <ThemeProvider theme={instantTheme}>
      <MemoryRouter initialEntries={entries}>
        <FeaturesPage />
      </MemoryRouter>
    </ThemeProvider>
  );
}

function hero() {
  return document.querySelector('section[aria-labelledby="features-heading"]');
}

function tiles() {
  return within(screen.getByRole('navigation', { name: 'Jump to a feature' })).getAllByRole('link');
}

function tile(name) {
  return within(screen.getByRole('navigation', { name: 'Jump to a feature' })).getByRole('link', {
    name,
  });
}

function stubMatchMedia(matches) {
  vi.stubGlobal('matchMedia', (query) => ({
    matches: matches(query),
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
}

// The same words now appear in the stories and the grid below, so explorer checks stay inside it.
function explorer() {
  return within(document.querySelector('#features-all'));
}

function everyText(container) {
  return [...container.querySelectorAll('p, li, span, h2, h3')].map((node) => node.textContent);
}

function row(name) {
  return within(screen.getByRole('list', { name: 'Features' })).getByRole('button', { name });
}

// This jsdom has no PointerEvent, so fireEvent.pointerEnter would drop pointerType.
// React builds enter/leave from over/out, so that is what gets dispatched.
function hover(node, pointerType) {
  const event = new MouseEvent('pointerover', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  fireEvent(node, event);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('FeaturesPage', () => {
  it('opens with the page title and its sections', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Everything it does.' })
    ).toBeInTheDocument();
    expect(screen.getByText('Twelve things it does for you, one by one.')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'In the app today' })).toBeVisible();
    expect(screen.getByRole('heading', { level: 2, name: 'And the rest' })).toBeVisible();
    expect(screen.queryByRole('button', { name: 'More for developers' })).not.toBeInTheDocument();
  });

  it('labels every section with its own heading', () => {
    const { container } = renderPage();
    const sections = ['features-all', ...DEEP_DIVE_IDS.map((id) => `deep-${id}`), 'features-rest'];
    for (const id of sections) {
      const section = container.querySelector(`section#${id}`);
      expect(section).toHaveClass('oi-section');
      const heading = container.querySelector(`#${section.getAttribute('aria-labelledby')}`);
      expect(heading.tagName).toBe('H2');
      expect(heading).toHaveClass('oi-h2');
    }
  });

  it('tells four features as full stories, in page order, each beside a decorative mock', () => {
    const { container } = renderPage();
    const stories = [...container.querySelectorAll('section.ofd-section')];
    expect(
      stories.map((story) => within(story).getByRole('heading', { level: 2 }).textContent)
    ).toEqual(['Workspace panel', 'Process flow', 'Task tracker', 'Knowledge base']);
    for (const story of stories) {
      const lines = story.querySelectorAll('.ofd-lead, .ofd-line');
      expect(lines.length).toBeGreaterThanOrEqual(2);
      expect(lines.length).toBeLessThanOrEqual(3);
      expect(story.querySelector('.ofd-mock').closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('builds every story line from that feature own words, adding nothing', () => {
    const { container } = renderPage();
    for (const id of DEEP_DIVE_IDS) {
      const feature = FEATURES.find((item) => item.id === id);
      const source = [feature.today, feature.note, feature.also].filter(Boolean).join(' ');
      for (const line of container.querySelectorAll(
        `#deep-${id} .ofd-lead, #deep-${id} .ofd-line`
      )) {
        expect(source).toContain(line.textContent.replace(/\.$/, ''));
      }
    }
  });

  it('shows the app menu in a mock exactly as the app has it', () => {
    const { container } = renderPage();
    const menus = [...container.querySelectorAll('.ofd-menu')];
    expect(menus.length).toBeGreaterThan(0);
    for (const menu of menus) {
      expect([...menu.querySelectorAll('li')].map((item) => item.textContent)).toEqual([
        'New Chat',
        'Recent',
        'Pinned',
        'Intelligence',
        'Plugins',
        'Instruments',
        'History',
      ]);
    }
  });

  it('puts the other eight features in one grid of cards', () => {
    const { container } = renderPage();
    const cards = within(container.querySelector('#features-rest')).getAllByRole('article');
    const rest = FEATURES.filter((feature) => !DEEP_DIVE_IDS.includes(feature.id));
    expect(cards).toHaveLength(8);
    rest.forEach((feature, index) => {
      const card = within(cards[index]);
      expect(card.getByRole('heading', { level: 3, name: feature.name })).toBeVisible();
      expect(card.getByText(feature.today)).toBeVisible();
    });
  });

  it('lists all 12 features as buttons, with the first one pressed', () => {
    renderPage();
    const buttons = within(screen.getByRole('list', { name: 'Features' })).getAllByRole('button');
    expect(buttons.map((button) => button.textContent.replace(/\d+$/, ''))).toEqual(
      FEATURES.map((feature) => feature.name)
    );
    expect(buttons).toHaveLength(12);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      ...Array(11).fill('false'),
    ]);
    expect(explorer().getByText(FEATURES[0].today)).toBeVisible();
  });

  it('shows the clicked feature and hides the one before it', () => {
    renderPage();
    const [first, , third] = FEATURES;
    expect(explorer().getByText(third.today)).not.toBeVisible();

    fireEvent.click(row(third.name));

    expect(row(third.name)).toHaveAttribute('aria-pressed', 'true');
    expect(row(first.name)).toHaveAttribute('aria-pressed', 'false');
    expect(explorer().getByText(third.today)).toBeVisible();
    expect(explorer().getByRole('heading', { level: 3, name: third.name })).toBeVisible();
    expect(explorer().getByText(first.today)).not.toBeVisible();
  });

  it('follows keyboard focus as well as the click', () => {
    renderPage();
    fireEvent.focus(row(FEATURES[4].name));
    expect(row(FEATURES[4].name)).toHaveAttribute('aria-pressed', 'true');
    expect(explorer().getByText(FEATURES[4].today)).toBeVisible();
  });

  it('follows the mouse, but not a finger', () => {
    renderPage();
    hover(row(FEATURES[5].name), 'touch');
    expect(row(FEATURES[5].name)).toHaveAttribute('aria-pressed', 'false');
    hover(row(FEATURES[5].name), 'mouse');
    expect(row(FEATURES[5].name)).toHaveAttribute('aria-pressed', 'true');
  });

  it('moves through the list with the arrow keys and stops at both ends', () => {
    renderPage();
    const names = FEATURES.map((feature) => feature.name);

    fireEvent.keyDown(row(names[0]), { key: 'ArrowDown' });
    expect(row(names[1])).toHaveAttribute('aria-pressed', 'true');
    expect(row(names[1])).toHaveFocus();
    expect(explorer().getByText(FEATURES[1].today)).toBeVisible();
    expect(explorer().getByText(FEATURES[0].today)).not.toBeVisible();

    fireEvent.keyDown(row(names[1]), { key: 'ArrowUp' });
    fireEvent.keyDown(row(names[0]), { key: 'ArrowUp' });
    expect(row(names[0])).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(row(names[0]), { key: 'End' });
    expect(row(names[11])).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(row(names[11]), { key: 'ArrowDown' });
    expect(row(names[11])).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(row(names[11]), { key: 'Home' });
    expect(row(names[0])).toHaveAttribute('aria-pressed', 'true');
  });

  it('points each button at the panel it controls and the words that describe it', () => {
    const { container } = renderPage();
    for (const feature of FEATURES) {
      const button = row(feature.name);
      const panel = container.querySelector(`#${button.getAttribute('aria-controls')}`);
      expect(within(panel).getByText(feature.today)).toBeInTheDocument();
      expect(
        container.querySelector(`#${button.getAttribute('aria-describedby')}`)
      ).toHaveTextContent(feature.today);
    }
  });

  it('keeps every today, note and also text in the DOM, word for word', () => {
    const { container } = renderPage();
    const texts = everyText(container);
    for (const feature of FEATURES) {
      for (const words of [feature.today, feature.note, feature.also].filter(Boolean)) {
        expect(texts).toContain(words);
        expect(explorer().getByText(words)).toBeInTheDocument();
      }
    }
  });

  it('marks a note by what it asks of you', () => {
    const { container } = renderPage();
    const badgeFor = (id) =>
      container.querySelector(`#feature-${id} .oif-note .oi-badge`)?.textContent;
    expect(badgeFor('flow')).toBe('you switch it on');
    expect(badgeFor('knowledge')).toBe('you switch it on');
    expect(badgeFor('browser')).toBe('needs setup');
    expect(badgeFor('connections')).toBe('needs setup');
    expect(container.querySelector('#feature-workspace .oif-note')).toBeNull();
  });

  it('shows the second line of a feature under a plain Also tag', () => {
    const { container } = renderPage();
    const withAlso = FEATURES.filter((feature) => feature.also);
    expect(withAlso).toHaveLength(9);
    for (const feature of withAlso) {
      expect(container.querySelector(`#feature-${feature.id} .oif-also`)).toHaveTextContent(
        `Also${feature.also}`
      );
    }
    expect(container.querySelector('#feature-coding .oif-also')).toBeNull();
    expect(container.querySelectorAll('.oif-also .oi-badge')).toHaveLength(0);
  });

  it('presents every feature as equal: nothing is marked as planned or for later', () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('[data-planned]')).toHaveLength(0);
    expect(container.querySelector('#features-planned')).toBeNull();
    expect(container.textContent).not.toMatch(
      /planned|\bsoon\b|coming|what's next|not in the app yet|\blater\b/i
    );
    for (const feature of FEATURES) expect(feature).not.toHaveProperty('planned');
  });

  it('never says beta, and never uses the banned claim words', () => {
    const { container } = renderPage();
    expect(container.textContent).not.toMatch(/beta/i);
    expect(container.textContent).not.toMatch(
      /shield|data leaks|checks itself|IDE replacement|sub-2|SOC2|zero hallucination|\bverified\b|\bproduction\b|\baverage\b|Orqaly|AxWise|Slack|Telegram/i
    );
  });

  it('uses every id once', () => {
    const { container } = renderPage();
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
    expect(ids.length).toBeGreaterThan(48);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('draws with inline SVG only', () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('img, iframe, video, canvas')).toHaveLength(0);
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
    }
  });
});

describe('FeaturesPage hero: the wall of twelve', () => {
  it('keeps the title, its id and the line, and names the block by its title', () => {
    renderPage();
    const title = screen.getByRole('heading', { level: 1 });
    expect(title).toHaveTextContent(/^Everything it does\.$/);
    expect(title).toHaveAttribute('id', 'features-heading');
    expect(hero()).toContainElement(title);
    expect(within(hero()).getByText('Features')).toHaveClass('oi-tag-bracket');
    expect(within(hero()).getByText('Twelve things it does for you, one by one.')).toBeVisible();
  });

  it('lays exactly one tile per feature, in data order, each a link to that feature', () => {
    renderPage();
    expect(tiles()).toHaveLength(12);
    tiles().forEach((link, index) => {
      expect(link).toHaveAccessibleName(FEATURES[index].name);
      expect(link.hash).toBe(`#feature-${FEATURES[index].id}`);
      expect(hero()).toContainElement(link);
    });
  });

  it('numbers the tiles 01 to 12 for the eye only', () => {
    renderPage();
    tiles().forEach((link, index) => {
      const number = link.querySelector('.ohf-number');
      expect(number).toHaveTextContent(String(index + 1).padStart(2, '0'));
      expect(number).toHaveAttribute('aria-hidden', 'true');
    });
  });

  it('points every tile at one element that is really in the page', () => {
    const { container } = renderPage();
    for (const link of tiles()) {
      const targets = container.querySelectorAll(`[id="${link.hash.slice(1)}"]`);
      expect(targets).toHaveLength(1);
      expect(within(targets[0]).getByRole('heading', { level: 3, hidden: true })).toHaveTextContent(
        link.textContent.replace(/^\d+/, '')
      );
    }
  });

  it('selects the feature in the explorer when its tile is followed, and moves focus there', () => {
    renderPage();
    const seventh = FEATURES[6];
    expect(explorer().getByText(seventh.today)).not.toBeVisible();

    fireEvent.click(tile(seventh.name));

    expect(row(seventh.name)).toHaveAttribute('aria-pressed', 'true');
    expect(row(seventh.name)).toHaveFocus();
    expect(row(FEATURES[0].name)).toHaveAttribute('aria-pressed', 'false');
    expect(explorer().getByText(seventh.today)).toBeVisible();
  });

  it('lands again when the same tile is followed twice', () => {
    renderPage();
    fireEvent.click(tile(FEATURES[6].name));
    fireEvent.click(row(FEATURES[2].name));
    expect(row(FEATURES[2].name)).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(tile(FEATURES[6].name));
    expect(row(FEATURES[6].name)).toHaveAttribute('aria-pressed', 'true');
  });

  it('opens on the feature named in the address, and ignores a hash it does not know', () => {
    renderPage(['/#feature-voice']);
    expect(row('Voice control')).toHaveAttribute('aria-pressed', 'true');
    cleanup();

    renderPage(['/#features-rest']);
    expect(row(FEATURES[0].name)).toHaveAttribute('aria-pressed', 'true');
  });

  it('scrolls the explorer into view, smoothly unless motion is reduced', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      renderPage();
      fireEvent.click(tile(FEATURES[3].name));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView.mock.instances[0]).toBe(document.querySelector('#features-explorer'));
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

      stubMatchMedia((query) => query === '(prefers-reduced-motion: reduce)');
      fireEvent.click(tile(FEATURES[4].name));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
      expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'start' });
    } finally {
      delete Element.prototype.scrollIntoView;
      vi.unstubAllGlobals();
    }
  });

  it('keeps every drawing out of the reading order and uses no image, frame, video or canvas', () => {
    renderPage();
    expect(hero().querySelectorAll('img, iframe, video, canvas')).toHaveLength(0);
    const drawings = hero().querySelectorAll('svg');
    expect(drawings.length).toBeGreaterThanOrEqual(13);
    for (const svg of drawings) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
    }
    for (const decoration of hero().querySelectorAll('.ohf-light, .ohf-ruler, .ohf-head-rule')) {
      expect(decoration).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('adds two words of its own and none of the banned ones', () => {
    renderPage();
    const wall = screen.getByRole('navigation', { name: 'Jump to a feature' });
    const names = FEATURES.map(
      (feature, index) => `${String(index + 1).padStart(2, '0')}${feature.name}`
    );
    expect(wall.textContent).toBe(`Jump to01 \u2013 12${names.join('')}`);
    expect(hero().textContent).not.toMatch(
      /planned|beta|\bsoon\b|coming|shield|SOC2|verified|production|guaranteed|Slack|Telegram|Orqaly|AxWise|zero hallucination|(\d|times) faster/i
    );
  });

  it('moves by CSS alone: it starts no frame loop and no interval, reduced motion or not', () => {
    const frames = vi.spyOn(window, 'requestAnimationFrame');
    const intervals = vi.spyOn(window, 'setInterval');
    renderPage();
    expect(tiles()).toHaveLength(12);
    cleanup();

    stubMatchMedia((query) => query === '(prefers-reduced-motion: reduce)');
    try {
      renderPage();
      for (const link of tiles()) expect(link).toBeVisible();
      expect(frames).not.toHaveBeenCalled();
      expect(intervals).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});

describe('FeaturesPage on a phone', () => {
  beforeAll(() => {
    stubMatchMedia((query) => query === '(max-width: 820px)');
  });

  afterAll(() => {
    vi.unstubAllGlobals();
  });

  it('stacks every feature as its own open card, with nothing to pick', () => {
    renderPage();
    const list = screen.getByRole('list', { name: 'Features' });
    expect(within(list).queryAllByRole('button')).toHaveLength(0);
    const cards = within(list).getAllByRole('article');
    expect(cards).toHaveLength(12);
    FEATURES.forEach((feature, index) => {
      const card = within(cards[index]);
      expect(card.getByRole('heading', { level: 3, name: feature.name })).toBeVisible();
      expect(card.getByText(feature.today)).toBeVisible();
      if (feature.note) expect(card.getByText(feature.note)).toBeVisible();
      if (feature.also) {
        expect(card.getByText(feature.also).closest('.oif-also')).toHaveTextContent(
          `Also${feature.also}`
        );
      }
    });
  });

  it('lands a tile of the hero on that feature own card, and moves focus to it', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const { container } = renderPage();
      for (const link of tiles()) {
        expect(container.querySelectorAll(`[id="${link.hash.slice(1)}"]`)).toHaveLength(1);
      }

      const ninth = FEATURES[8];
      fireEvent.click(tile(ninth.name));

      const card = container.querySelector(`#feature-${ninth.id}`);
      expect(card.tagName).toBe('LI');
      expect(within(card).getByRole('heading', { level: 3, name: ninth.name })).toBeVisible();
      expect(card).toHaveFocus();
      await waitFor(() => expect(scrollIntoView.mock.instances).toEqual([card]));
    } finally {
      delete Element.prototype.scrollIntoView;
    }
  });

  it('marks nothing as planned there either, and still uses every id once', () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('[data-planned]')).toHaveLength(0);
    expect(container.textContent).not.toMatch(/planned/i);
    expect(screen.getAllByRole('heading', { level: 2 }).map((node) => node.textContent)).toEqual(
      expect.arrayContaining(['Workspace panel', 'Process flow', 'Task tracker', 'Knowledge base'])
    );
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
