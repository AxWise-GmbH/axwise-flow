import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { Link, MemoryRouter } from 'react-router-dom';
import { instantTheme } from '../instantTheme';
import { DEEP_DIVE_IDS, FEATURES } from './features.data';
import FeaturesPage from './FeaturesPage';

// `links` adds one plain link per feature, the way a shared address or another page would
// point at #feature-<id>. Nothing on the page itself links there since the wall went.
function renderPage(entries = ['/'], { links = false } = {}) {
  return render(
    <ThemeProvider theme={instantTheme}>
      <MemoryRouter initialEntries={entries}>
        <FeaturesPage />
        {links && (
          <nav aria-label="Links to features">
            {FEATURES.map((feature) => (
              <Link key={feature.id} to={{ hash: `#feature-${feature.id}` }}>
                {feature.name}
              </Link>
            ))}
          </nav>
        )}
      </MemoryRouter>
    </ThemeProvider>
  );
}

function jumps() {
  return within(screen.getByRole('navigation', { name: 'Links to features' })).getAllByRole('link');
}

function jump(name) {
  return within(screen.getByRole('navigation', { name: 'Links to features' })).getByRole('link', {
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
  it('counts nothing over the deep dives or "And the rest" (owner, 2026-09-21)', () => {
    const { container } = renderPage();
    const stories = container.querySelectorAll('.ofd-section');
    expect(stories.length).toBeGreaterThan(0);
    for (const story of stories) expect(story.querySelector('.oi-tag-bracket')).toBeNull();
    expect(container.querySelector('#features-rest .oi-tag-bracket')).toBeNull();
    expect(screen.queryByText(/^\d+ more$/i)).toBeNull();
  });

  it('opens straight on the explorer: no opening wall, no tag, its heading the page title', () => {
    const { container } = renderPage();
    // The owner took the opening block ("Everything it does." and its wall of twelve tiles),
    // the rule under it and the "Feature by feature" tag off.
    expect(container.querySelector('section.oph')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'Jump to a feature' })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /Everything it does|Twelve things it does|Feature by feature/i
    );

    const first = container.querySelector('section');
    expect(first).toHaveAttribute('id', 'features-all');
    expect(first).not.toHaveClass('oif-ruled');
    expect(first.querySelector('.oif-head .oi-tag')).toBeNull();
    const titles = screen.getAllByRole('heading', { level: 1 });
    expect(titles).toHaveLength(1);
    expect(titles[0]).toHaveTextContent('In the app today');
    expect(titles[0]).toHaveAttribute('id', 'features-all-heading');
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
      // The explorer opens the page, so its heading is the page's one h1.
      expect(heading.tagName).toBe(id === 'features-all' ? 'H1' : 'H2');
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

  it('puts the other fourteen features in one grid of cards', () => {
    const { container } = renderPage();
    const cards = within(container.querySelector('#features-rest')).getAllByRole('article');
    const rest = FEATURES.filter((feature) => !DEEP_DIVE_IDS.includes(feature.id));
    expect(cards).toHaveLength(14);
    rest.forEach((feature, index) => {
      const card = within(cards[index]);
      expect(card.getByRole('heading', { level: 3, name: feature.name })).toBeVisible();
      expect(card.getByText(feature.today)).toBeVisible();
    });
  });

  it('lists all 18 features as buttons, with the first one pressed', () => {
    renderPage();
    const buttons = within(screen.getByRole('list', { name: 'Features' })).getAllByRole('button');
    expect(buttons.map((button) => button.textContent.replace(/\d+$/, ''))).toEqual(
      FEATURES.map((feature) => feature.name)
    );
    expect(buttons).toHaveLength(18);
    expect(buttons.map((button) => button.getAttribute('aria-pressed'))).toEqual([
      'true',
      ...Array(17).fill('false'),
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
    expect(row(names[17])).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(row(names[17]), { key: 'ArrowDown' });
    expect(row(names[17])).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(row(names[17]), { key: 'Home' });
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

describe('FeaturesPage deep links to a feature', () => {
  it('gives every feature one anchor to link to, holding its name', () => {
    const { container } = renderPage();
    for (const feature of FEATURES) {
      const targets = container.querySelectorAll(`[id="feature-${feature.id}"]`);
      expect(targets).toHaveLength(1);
      expect(within(targets[0]).getByRole('heading', { level: 3, hidden: true })).toHaveTextContent(
        feature.name
      );
    }
  });

  it('selects the feature in the explorer when a link to it is followed, and moves focus there', () => {
    renderPage(['/'], { links: true });
    const seventh = FEATURES[6];
    expect(explorer().getByText(seventh.today)).not.toBeVisible();

    fireEvent.click(jump(seventh.name));

    expect(row(seventh.name)).toHaveAttribute('aria-pressed', 'true');
    expect(row(seventh.name)).toHaveFocus();
    expect(row(FEATURES[0].name)).toHaveAttribute('aria-pressed', 'false');
    expect(explorer().getByText(seventh.today)).toBeVisible();
  });

  it('lands again when the same link is followed twice', () => {
    renderPage(['/'], { links: true });
    fireEvent.click(jump(FEATURES[6].name));
    fireEvent.click(row(FEATURES[2].name));
    expect(row(FEATURES[2].name)).toHaveAttribute('aria-pressed', 'true');

    fireEvent.click(jump(FEATURES[6].name));
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
      renderPage(['/'], { links: true });
      fireEvent.click(jump(FEATURES[3].name));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(1));
      expect(scrollIntoView.mock.instances[0]).toBe(document.querySelector('#features-explorer'));
      expect(scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });

      stubMatchMedia((query) => query === '(prefers-reduced-motion: reduce)');
      fireEvent.click(jump(FEATURES[4].name));
      await waitFor(() => expect(scrollIntoView).toHaveBeenCalledTimes(2));
      expect(scrollIntoView).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'start' });
    } finally {
      delete Element.prototype.scrollIntoView;
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
    expect(cards).toHaveLength(18);
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

  it('lands a link to a feature on that feature own card, and moves focus to it', async () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    try {
      const { container } = renderPage(['/'], { links: true });
      for (const link of jumps()) {
        expect(container.querySelectorAll(`[id="${link.hash.slice(1)}"]`)).toHaveLength(1);
      }

      const ninth = FEATURES[8];
      fireEvent.click(jump(ninth.name));

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
