import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material';
import { MemoryRouter } from 'react-router-dom';
import SpeedPage from './SpeedPage';
import SpeedHero from './heroes/SpeedHero';

const METHOD = [
  'Measured once each, on 18 September 2026.',
  'In the Orqanix cloud preview, not in the desktop app.',
  'One test scenario: a food-compliance project for a retailer in Estonia.',
  'Not averages. Your times will differ with the task, the load and the AI model version.',
  'These are single documents. A full starter pack is many pieces and takes longer.',
  'The 84-second run finished with evidence gaps flagged by its own audit.',
];

const BANNED = [
  'shield',
  'data leaks',
  'Nothing runs without',
  'checks itself',
  'IDE replacement',
  'sub-2',
  'SOC2',
  'zero hallucination',
  'verified',
  'production',
  'Orqaly',
  'AxWise',
  'Slack',
  'Telegram',
  'beta',
];

function renderPage() {
  return render(
    <ThemeProvider theme={createTheme()}>
      <MemoryRouter>
        <SpeedPage />
      </MemoryRouter>
    </ThemeProvider>
  );
}

function section(container, id) {
  return container.querySelector(`#${id}`);
}

const HERO_RUNS = [
  { id: 'answer', seconds: 1.86, label: 'a direct answer', href: '#speed-run-answer' },
  { id: 'summary', seconds: 19.08, label: 'a short summary', href: '#speed-run-summary' },
  { id: 'document', seconds: 84.04, label: 'an 8-page document', href: '#speed-run-document' },
];

function renderHero() {
  return render(<SpeedHero runs={HERO_RUNS} methodHref="#speed-method" />);
}

function hero(container) {
  return container.querySelector('.ohs-hero');
}

/** What assistive tech reads: the text with every aria-hidden node taken out. */
function spokenText(node) {
  const clone = node.cloneNode(true);
  clone.querySelectorAll('[aria-hidden="true"]').forEach((hidden) => hidden.remove());
  return clone.textContent;
}

function stubReducedMotion() {
  vi.stubGlobal('matchMedia', (query) => ({
    matches: query === '(prefers-reduced-motion: reduce)',
    media: query,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
  }));
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('SpeedPage', () => {
  it('opens with the page title and one line', () => {
    renderPage();
    expect(
      screen.getByRole('heading', { level: 1, name: 'Measured, not promised.' })
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Three real timings from the Orqanix cloud, with the date and the limits next to them.'
      )
    ).toBeInTheDocument();
  });

  it('gives every section its own heading and label', () => {
    const { container } = renderPage();
    const sections = [
      ['speed-race', 'Three timings'],
      ['speed-made', 'What each run made'],
      ['speed-method', 'How we measured'],
    ];
    sections.forEach(([id, name]) => {
      const el = section(container, id);
      expect(el).toHaveClass('oi-section');
      const heading = within(el).getByRole('heading', { level: 2, name });
      expect(heading).toHaveClass('oi-h2');
      expect(el).toHaveAttribute('aria-labelledby', heading.id);
    });
  });

  it('shows the three rounded timings with their labels', () => {
    const { container } = renderPage();
    const pairs = [...section(container, 'speed-race').querySelectorAll('.osp-figure')].map(
      (figure) => [
        // The visible digits count up; the finished figure is the text readers get.
        figure.querySelector('.oi-sr-only').textContent,
        figure.querySelector('.osp-label').textContent,
      ]
    );
    expect(pairs).toEqual([
      ['1.9 s', 'a direct answer'],
      ['19 s', 'a short summary'],
      ['84 s', 'an 8-page document'],
    ]);
  });

  it('draws the light tracks and the time axis as decoration only', () => {
    const { container } = renderPage();
    const race = section(container, 'speed-race');
    const lanes = [...race.querySelectorAll('.osp-lane')];
    expect(lanes).toHaveLength(3);
    lanes.forEach((lane) => expect(lane).toHaveAttribute('aria-hidden', 'true'));
    const axis = race.querySelector('.osp-axis');
    expect(axis).toHaveAttribute('aria-hidden', 'true');
    expect([...axis.querySelectorAll('.osp-axis-label')].map((label) => label.textContent)).toEqual(
      ['0', '30', '60', '90']
    );
  });

  it('places each light on the shared axis in proportion to its time', () => {
    const { container } = renderPage();
    const shares = [...container.querySelectorAll('.osp-row')].map((row) =>
      Number(row.style.getPropertyValue('--p'))
    );
    expect(shares[0]).toBeCloseTo(1.86 / 90, 5);
    expect(shares[1]).toBeCloseTo(19.08 / 90, 5);
    expect(shares[2]).toBeCloseTo(84.04 / 90, 5);
  });

  it('says that the animation is not real time', () => {
    renderPage();
    expect(screen.getByText('Animation is sped up. Figures are real.')).toBeInTheDocument();
  });

  it('has a Replay button that restarts the lights and keeps the figures', () => {
    const { container } = renderPage();
    const before = container.querySelector('.osp-lane');
    const replay = screen.getByRole('button', { name: 'Replay' });
    fireEvent.click(replay);
    expect(container.querySelector('.osp-lane')).not.toBe(before);
    expect(
      [...container.querySelectorAll('.osp-figure .oi-sr-only')].map((node) => node.textContent)
    ).toEqual(['1.9 s', '19 s', '84 s']);
  });

  it('shows what each run made, with the exact time', () => {
    const { container } = renderPage();
    const cards = within(section(container, 'speed-made')).getAllByRole('article');
    const rows = cards.map((card) => [
      card.querySelector('.osp-time').textContent,
      within(card).getByRole('heading', { level: 3 }).textContent,
      card.querySelector('.osp-card-line').textContent,
    ]);
    expect(rows).toEqual([
      ['1.86 s', 'A direct answer', '137 tokens.'],
      ['19.08 s', 'A short summary', '767 words, about a page and a half.'],
      ['84.04 s', 'A full planning document', '3,951 words, about 8 pages.'],
    ]);
    cards.forEach((card) => {
      expect(card).toHaveAccessibleName(
        within(card).getByRole('heading', { level: 3 }).textContent
      );
    });
  });

  it('draws more text lines the more was written', () => {
    const { container } = renderPage();
    const counts = [...section(container, 'speed-made').querySelectorAll('.osp-glyph')].map(
      (glyph) => glyph.querySelectorAll('.osp-ink').length
    );
    expect(counts).toHaveLength(3);
    expect(counts[0]).toBeLessThan(counts[1]);
    expect(counts[1]).toBeLessThan(counts[2]);
  });

  it('lists the six limits word for word, in order', () => {
    const { container } = renderPage();
    const method = section(container, 'speed-method');
    expect(within(method).getByText('The limits matter as much as the numbers.')).toBeVisible();
    const items = within(method).getAllByRole('listitem');
    expect(items.map((item) => item.querySelector('.osp-rule-text').textContent)).toEqual(METHOD);
    expect(items.map((item) => item.querySelector('.osp-rule-idx').textContent)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
      '06',
    ]);
  });

  it('links to the full benchmark page', () => {
    renderPage();
    expect(screen.getByRole('link', { name: 'Open the full benchmark page' })).toHaveAttribute(
      'href',
      '/benchmark'
    );
  });

  it('makes no comparison and uses none of the banned words', () => {
    const { container } = renderPage();
    const text = container.textContent;
    expect(text).not.toMatch(/x faster/i);
    expect(text).not.toMatch(/\d\s?x\b|\d×/i);
    expect(text).not.toContain('%');
    BANNED.forEach((word) => expect(text.toLowerCase()).not.toContain(word.toLowerCase()));
    // "Not averages" is the honest wording; only the bare claim word is banned.
    expect(text).not.toMatch(/\baverage\b(?!s)/i);
  });

  it('shows only the measured figures', () => {
    const { container } = renderPage();
    // Index marks (01-06) and axis ticks are decoration; every other number must be a fact
    // from the single measured run.
    const clone = container.cloneNode(true);
    clone
      .querySelectorAll('.osp-idx, .osp-card-idx, .osp-rule-idx, .osp-axis, [aria-hidden="true"]')
      .forEach((node) => node.remove());
    const numbers = clone.textContent.match(/\d[\d.,]*\d|\d/g) ?? [];
    const allowed = new Set([
      '1.9',
      '19',
      '84',
      '1.86',
      '19.08',
      '84.04',
      '137',
      '767',
      '3,951',
      '8',
      '18',
      '2026',
    ]);
    expect(numbers.filter((number) => !allowed.has(number))).toEqual([]);
  });

  it('keeps every id unique and away from the ids of reused home sections', () => {
    const { container } = renderPage();
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    const reserved = [
      'speed',
      'control',
      'what-stays',
      'download',
      'watch',
      'questions',
      'use-cases',
      'how-it-works',
    ];
    reserved.forEach((id) => expect(ids).not.toContain(id));
  });

  it('uses no images, frames, video or canvas, and every drawing is decoration', () => {
    const { container } = renderPage();
    expect(container.querySelectorAll('img, iframe, video, canvas')).toHaveLength(0);
    container.querySelectorAll('svg').forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
    });
  });
});

describe('SpeedPage opening dial', () => {
  it('keeps the page heading, its id and its label for the section', () => {
    const { container } = renderPage();
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent('Measured, not promised.');
    expect(heading).toHaveAttribute('id', 'speed-page-heading');
    expect(hero(container)).toHaveAttribute('aria-labelledby', 'speed-page-heading');
    expect(container.querySelectorAll('h1')).toHaveLength(1);
  });

  it('links each readout to the card of what that run made', () => {
    const { container } = renderPage();
    const list = within(hero(container)).getByRole('list', { name: 'Measured timings' });
    const links = within(list).getAllByRole('link');
    expect(links).toHaveLength(3);
    const expected = [
      ['1.86 s a direct answer', '#speed-run-answer', 'A direct answer'],
      ['19.08 s a short summary', '#speed-run-summary', 'A short summary'],
      ['84.04 s an 8-page document', '#speed-run-document', 'A full planning document'],
    ];
    links.forEach((link, i) => {
      const [name, href, cardTitle] = expected[i];
      expect(link).toHaveAccessibleName(name);
      expect(link).toHaveAttribute('href', href);
      const targets = container.querySelectorAll(href);
      expect(targets).toHaveLength(1);
      expect(section(container, 'speed-made')).toContainElement(targets[0]);
      expect(within(targets[0]).getByRole('heading', { level: 3 })).toHaveTextContent(cardTitle);
    });
  });

  it('gives one quiet way down to the method', () => {
    const { container } = renderPage();
    const link = within(hero(container)).getByRole('link', { name: 'How we measured' });
    expect(link).toHaveAttribute('href', '#speed-method');
    expect(container.querySelectorAll('#speed-method')).toHaveLength(1);
  });

  it('says each exact timing once to assistive tech, and hides the counting digits', () => {
    const { container } = renderHero();
    const spoken = spokenText(hero(container));
    ['1.86 s', '19.08 s', '84.04 s'].forEach((timing) => {
      expect(spoken.split(timing)).toHaveLength(2);
    });
    container.querySelectorAll('.ohs-value').forEach((value) => {
      expect(value.querySelectorAll('.oi-sr-only')).toHaveLength(1);
      expect(value.querySelectorAll('[aria-hidden="true"]')).toHaveLength(1);
    });
  });

  it('shows when, where and how often it was measured', () => {
    const { container } = renderHero();
    const plate = within(hero(container)).getByRole('list', { name: 'How these were measured' });
    expect(
      within(plate)
        .getAllByRole('listitem')
        .map((item) => item.textContent)
    ).toEqual(['Single runs', '18 Sep 2026', 'Orqanix cloud']);
    within(plate)
      .getAllByRole('listitem')
      .forEach((item) => expect(item).toBeVisible());
  });

  it('draws the dial as decoration, with no image, frame, video or canvas', () => {
    const { container } = renderHero();
    const block = hero(container);
    expect(block.querySelectorAll('img, iframe, video, canvas')).toHaveLength(0);
    const drawings = [...block.querySelectorAll('svg')];
    expect(drawings.length).toBeGreaterThan(1);
    drawings.forEach((svg) => {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
    });
    // The face numerals and marker numbers are set in HTML over the drawing, hidden as one.
    const numerals = [...block.querySelectorAll('.ohs-numeral')];
    expect(numerals.map((numeral) => numeral.textContent)).toEqual(['0', '30', '60']);
    [...numerals, ...block.querySelectorAll('.ohs-index, .ohs-halo')].forEach((mark) => {
      expect(mark.closest('[aria-hidden="true"]')).not.toBeNull();
    });
  });

  it('puts each marker on the 90-second face in proportion to its time', () => {
    const { container } = renderHero();
    const lights = [...container.querySelectorAll('.ohs-halo')];
    expect(lights).toHaveLength(3);
    const angles = lights.map((light) => {
      const x = parseFloat(light.style.getPropertyValue('--x')) - 50;
      const y = 50 - parseFloat(light.style.getPropertyValue('--y'));
      return (Math.atan2(x, y) * 180) / Math.PI;
    });
    const turn = (seconds) => (seconds / 90) * 360;
    expect(angles[0]).toBeCloseTo(turn(1.86), 1);
    expect(angles[1]).toBeCloseTo(turn(19.08), 1);
    // Past half way round, atan2 reports the angle as a negative turn.
    expect(angles[2] + 360).toBeCloseTo(turn(84.04), 1);
  });

  it('stands finished under reduced motion: no frame, no interval, nothing to replay', () => {
    stubReducedMotion();
    const frames = vi.spyOn(window, 'requestAnimationFrame');
    const intervals = vi.spyOn(window, 'setInterval');
    const { container } = renderHero();
    expect(
      [...container.querySelectorAll('.ohs-value [aria-hidden="true"]')].map((n) => n.textContent)
    ).toEqual(['1.86 s', '19.08 s', '84.04 s']);
    container
      .querySelectorAll('.ohs-row, .ohs-lane, .ohs-halo')
      .forEach((node) => expect(node).toHaveAttribute('data-locked', 'true'));
    container
      .querySelectorAll('.ohs-arc')
      .forEach((path) => expect(path).toHaveAttribute('stroke-dashoffset', '0'));
    expect(container.querySelector('.ohs-sweep')).toHaveAttribute('data-moving', 'false');
    expect(screen.queryByRole('button')).toBeNull();
    expect(screen.queryByText('Sweep sped up')).toBeNull();
    expect(frames).not.toHaveBeenCalled();
    expect(intervals).not.toHaveBeenCalled();
  });

  it('replays from zero on one clock, says it is sped up, and never uses an interval', () => {
    const queue = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) =>
      queue.push(callback)
    );
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => {});
    const intervals = vi.spyOn(window, 'setInterval');
    const { container } = renderHero();
    const digits = () =>
      [...container.querySelectorAll('.ohs-value [aria-hidden="true"]')].map((n) => n.textContent);
    // Frames 40 ms apart: the hand waits 500 ms, then sweeps for 2600 ms.
    const play = (frames, from) => {
      for (let i = 0; i < frames; i += 1) {
        const callback = queue.shift();
        if (!callback) return;
        act(() => callback(from + i * 40));
      }
    };

    expect(digits()).toEqual(['0.00 s', '0.00 s', '0.00 s']);
    expect(screen.getByText('Sweep sped up')).toBeVisible();

    play(200, 1000);
    expect(digits()).toEqual(['1.86 s', '19.08 s', '84.04 s']);
    expect(queue).toHaveLength(0);

    fireEvent.click(screen.getByRole('button', { name: 'Replay the dial' }));
    expect(digits()).toEqual(['0.00 s', '0.00 s', '0.00 s']);
    container
      .querySelectorAll('.ohs-row')
      .forEach((row) => expect(row).toHaveAttribute('data-locked', 'false'));

    // Half way through the sweep the two short runs have locked and the long one is counting.
    play(47, 20000);
    const [answer, summary, document] = digits();
    expect([answer, summary]).toEqual(['1.86 s', '19.08 s']);
    expect(parseFloat(document)).toBeGreaterThan(19.08);
    expect(parseFloat(document)).toBeLessThan(84.04);

    play(200, 40000);
    expect(digits()).toEqual(['1.86 s', '19.08 s', '84.04 s']);
    expect(spokenText(hero(container)).split('84.04 s')).toHaveLength(2);
    expect(intervals).not.toHaveBeenCalled();
  });

  it('lights the lane of the readout under the pointer or the keyboard, and lets go on a click', () => {
    stubReducedMotion();
    const { container } = renderHero();
    const rows = [...container.querySelectorAll('.ohs-row')];
    const quiet = () =>
      [...container.querySelectorAll('.ohs-lane')].map((lane) => lane.getAttribute('data-quiet'));

    expect(quiet()).toEqual(['false', 'false', 'false']);
    fireEvent.pointerEnter(rows[1]);
    expect(quiet()).toEqual(['true', 'false', 'true']);
    fireEvent.pointerLeave(rows[1]);
    fireEvent.focus(rows[2]);
    expect(quiet()).toEqual(['true', 'true', 'false']);
    fireEvent.click(rows[2]);
    expect(quiet()).toEqual(['false', 'false', 'false']);
  });

  it('adds no claim and none of the banned words', () => {
    const { container } = renderHero();
    const text = hero(container).textContent;
    expect(text).not.toMatch(
      /planned|beta|\bsoon\b|coming|shield|SOC2|verified|production|guaranteed|Slack|Telegram|Orqaly|AxWise|zero hallucination|(\d|times) faster|\bup to\b|\baverage/i
    );
    expect(text).not.toMatch(/\d\s?x\b|\d\u00d7/i);
    expect(text).not.toContain('%');
  });
});
