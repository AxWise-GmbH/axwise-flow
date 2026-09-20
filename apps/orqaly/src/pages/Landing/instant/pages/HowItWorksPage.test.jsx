import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { instantTheme } from '../instantTheme';
import HowItWorksPage from './HowItWorksPage';
import HowHero from './heroes/HowHero';

const STEPS = [
  ['Say what you need', 'Type it or say it. Add files if they help.'],
  ['It makes a plan', 'A live roadmap: every stage, and the one running now.'],
  ['It asks when it needs you', 'Tap the answers, or the next step to start.'],
  ['It works on your Mac', 'Real files, real commands. You see every action and can stop any run.'],
  ['You review the result', 'Preview each file, compare the changes, open or save it.'],
];

const RULES = [
  ['Approve everything', 'It asks before every action.'],
  ['Only the risky ones', 'It asks when an action looks risky.'],
  ['Let it run', 'It works without asking. This is how the app starts.'],
];

const APP_STRINGS = [
  "Ask whatever's on your mind.",
  'ROADMAP',
  'Your Turn to Answer',
  '0 of 3 answered',
  'Send 3 answers',
  'Working',
  'Needs you',
  'Done',
  'EDITED',
  'NEW',
  'Wrote business-plan.md',
  'Ran a command',
];

// "Not averages" is the honest wording on the site; only the bare claim word is banned.
const BANNED = [
  /shield/i,
  /data leaks/i,
  /nothing runs without/i,
  /checks itself/i,
  /IDE replacement/i,
  /sub-2/i,
  /SOC2/i,
  /zero hallucination/i,
  /\bverified\b/i,
  /\bproduction\b/i,
  /\baverage\b/i,
  /Orqaly/i,
  /AxWise/i,
  /Slack/i,
  /Telegram/i,
  /\bbeta\b/i,
];

// The word on each station of the opening picture, in step order.
const STATIONS = ['Say', 'Plan', 'Ask', 'Work', 'Review'];

// Words the opening picture must not add, on top of the page-wide list.
const HERO_BANNED = [
  ...BANNED,
  /\bplanned\b/i,
  /\bsoon\b/i,
  /\bcoming\b/i,
  /guaranteed/i,
  /times faster/i,
];

function renderPage() {
  return render(
    <ThemeProvider theme={instantTheme}>
      <MemoryRouter>
        <HowItWorksPage />
      </MemoryRouter>
    </ThemeProvider>
  );
}

function renderHero() {
  return render(
    <HowHero
      id="how-heading"
      tag="How it works"
      title="You say it. It does it."
      line="One conversation."
      steps={STEPS.map(([title], index) => ({ number: `0${index + 1}`, title }))}
    />
  );
}

function journey() {
  return screen.getByRole('navigation', { name: 'The five steps' });
}

function stationStates() {
  return [...journey().querySelectorAll('.ohw-station')].map((station) =>
    station.getAttribute('data-state')
  );
}

// A browser that can animate: it has IntersectionObserver, and it reports the picture in view.
function stubLiveBrowser({ reducedMotion = false } = {}) {
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback) {
        this.callback = callback;
      }
      observe(target) {
        this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }]);
      }
      disconnect() {}
    }
  );
  vi.stubGlobal('matchMedia', (query) => ({
    matches: reducedMotion && query.includes('prefers-reduced-motion'),
    media: query,
    addEventListener() {},
    removeEventListener() {},
  }));
}

// The loop's only clock is a CSS animation; its end is what moves the journey on a beat.
function endBeat() {
  act(() => {
    fireEvent.animationEnd(journey().querySelector('.ohw-clock'));
  });
}

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HowItWorksPage', () => {
  it('opens with the page title and its one line', () => {
    renderPage();
    const title = screen.getByRole('heading', { level: 1 });
    expect(title.textContent).toBe('You say it. It does it.');
    expect(title).toHaveAttribute('id', 'how-heading');
    expect(
      screen.getByText(
        'One conversation on your Mac: it plans, asks when it needs you, does the work and shows you every step.'
      )
    ).toBeVisible();
  });

  it('tells the five steps in order, each a title and one line', () => {
    const { container } = renderPage();
    const section = container.querySelector('#how-steps');
    expect(section).toHaveAttribute('aria-labelledby', 'how-steps-heading');
    expect(
      within(section).getByRole('heading', { level: 2, name: 'Five steps, one chat' })
    ).toHaveAttribute('id', 'how-steps-heading');

    const steps = [...section.querySelectorAll('.hiw-step')];
    expect(
      steps.map((step) => [
        step.querySelector('h3').textContent,
        step.querySelector('.hiw-step-line').textContent,
      ])
    ).toEqual(STEPS);
    expect(steps.map((step) => step.querySelector('.hiw-num').textContent)).toEqual([
      '01',
      '02',
      '03',
      '04',
      '05',
    ]);
  });

  it('shows every step at once where nothing can animate', () => {
    const { container } = renderPage();
    // jsdom has no IntersectionObserver, which is also how the page spots "no real browser".
    expect(container.querySelector('.hiw-story')).toHaveAttribute('data-still', 'true');
    for (const step of container.querySelectorAll('.hiw-step')) {
      expect(step).toHaveAttribute('data-state', 'lit');
    }
  });

  it('draws the app pieces with the real app wording, hidden from assistive tech', () => {
    const { container } = renderPage();
    const mocks = [...container.querySelectorAll('.hiw-step-mock')];
    expect(mocks).toHaveLength(5);
    for (const mock of mocks) expect(mock).toHaveAttribute('aria-hidden', 'true');
    const drawn = mocks.map((mock) => mock.textContent).join('\n');
    for (const text of APP_STRINGS) expect(drawn).toContain(text);
  });

  it('keeps the extra detail about the steps one click away', () => {
    const { container } = renderPage();
    const toggle = within(container.querySelector('#how-steps')).getByRole('button', {
      name: 'More',
    });
    const detail = screen.getByText('It previews the pages and files it builds, inside the app.');
    expect(detail).not.toBeVisible();
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(detail).toBeVisible();
  });

  it('reuses the "What stays on your Mac" section between the steps and the rules', () => {
    const { container } = renderPage();
    expect(
      screen.getByRole('heading', { level: 2, name: 'What stays on your Mac' })
    ).toBeInTheDocument();
    const order = [...container.querySelectorAll('section.oi-section')].map(
      (section) => section.id
    );
    expect(order).toEqual(['how-steps', 'what-stays', 'how-control']);
  });

  it('offers exactly three rules, each a title and one line, and the stop promise', () => {
    const { container } = renderPage();
    const section = container.querySelector('#how-control');
    expect(section).toHaveAttribute('aria-labelledby', 'how-control-heading');
    expect(
      within(section).getByRole('heading', { level: 2, name: 'You set the rules' })
    ).toHaveAttribute('id', 'how-control-heading');
    expect(
      within(section).getByText(
        'Choose how much it may do without asking. Change it any time in Settings.'
      )
    ).toBeVisible();

    const cards = [...section.querySelectorAll('.hiw-rule')];
    expect(
      cards.map((card) => [
        card.querySelector('h3').textContent,
        card.querySelector('.hiw-rule-line').textContent,
      ])
    ).toEqual(RULES);
    for (const card of cards) {
      // The dial answers keyboard focus as well as the pointer.
      expect(card).toHaveAttribute('tabindex', '0');
      expect(card.querySelector('.hiw-rule-tag').textContent).not.toBe('');
      expect(card.querySelector('svg.hiw-dial')).toHaveAttribute('aria-hidden', 'true');
    }
    expect(within(section).getByText('You can stop any run at any moment.')).toBeVisible();
  });

  it('gives every section its own heading and uses each id once', () => {
    const { container } = renderPage();
    for (const section of container.querySelectorAll('section.oi-section')) {
      const heading = container.querySelector(`#${section.getAttribute('aria-labelledby')}`);
      expect(heading?.tagName).toBe('H2');
      expect(section.contains(heading)).toBe(true);
    }
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Ids that belong to the sections this page reuses or links to; the page's own stay clear.
    const taken = ['speed', 'control', 'what-stays', 'download', 'watch', 'questions', 'use-cases'];
    const own = ids.filter((id) => id.startsWith('how-') && id !== 'how-it-works');
    expect(own).toEqual([
      'how-heading',
      'how-steps',
      'how-steps-heading',
      'how-step-01',
      'how-step-02',
      'how-step-03',
      'how-step-04',
      'how-step-05',
      'how-control',
      'how-control-heading',
    ]);
    for (const id of own) expect(taken).not.toContain(id);
  });

  it('uses no images, frames or video, and a canvas only for the hidden orb', () => {
    const { container } = renderPage();
    expect(container.querySelector('img, iframe, video')).toBeNull();
    for (const canvas of container.querySelectorAll('canvas')) {
      expect(canvas.closest('[data-orb]')).toHaveAttribute('aria-hidden', 'true');
    }
    for (const svg of container.querySelectorAll('svg')) {
      expect(svg.getAttribute('focusable')).toBe('false');
      expect(svg.closest('[aria-hidden="true"]')).not.toBeNull();
    }
  });

  it('never uses a banned word, open or closed', () => {
    const { container } = renderPage();
    for (const toggle of screen.getAllByRole('button', { expanded: false }))
      fireEvent.click(toggle);
    for (const pattern of BANNED) expect(container.textContent).not.toMatch(pattern);
  });
});

describe('HowItWorksPage opening picture', () => {
  it('keeps the title inside the shared frame and draws the journey beside it', () => {
    const { container } = renderPage();
    const hero = container.querySelector('section.oph');
    expect(hero).toHaveAttribute('aria-labelledby', 'how-heading');
    expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent(
      'You say it. It does it.'
    );
    expect(within(hero).getByText('How it works')).toHaveClass('oi-tag-bracket');
    expect(hero.querySelector('.oph-visual')).toContainElement(journey());
  });

  it('links five stations, in step order, each to its step of the story', () => {
    const { container } = renderPage();
    const links = within(journey()).getAllByRole('link');
    expect(links.map((link) => link.getAttribute('href'))).toEqual([
      '#how-step-01',
      '#how-step-02',
      '#how-step-03',
      '#how-step-04',
      '#how-step-05',
    ]);
    expect(within(journey()).getAllByRole('listitem')).toHaveLength(5);

    links.forEach((link, index) => {
      const [title] = STEPS[index];
      // The name starts with the word that is shown, then says which step it opens.
      expect(link).toHaveAccessibleName(`${STATIONS[index]}. Step ${index + 1} of 5: ${title}`);
      expect(link.querySelector('.ohw-name').textContent).toBe(STATIONS[index]);
      expect(link.querySelector('.ohw-num').textContent).toBe(`0${index + 1}`);

      const targets = container.querySelectorAll(link.getAttribute('href'));
      expect(targets).toHaveLength(1);
      expect(targets[0]).toHaveClass('hiw-step');
      expect(targets[0].querySelector('h3').textContent).toBe(title);
      // The step can take focus, so the keyboard follows the jump; it is not a tab stop.
      expect(targets[0]).toHaveAttribute('tabindex', '-1');
    });
  });

  it('is drawn with hidden inline SVG only', () => {
    renderPage();
    expect(journey().querySelector('img, iframe, video, canvas')).toBeNull();
    const drawings = journey().querySelectorAll('svg');
    expect(drawings.length).toBeGreaterThan(0);
    for (const svg of drawings) {
      expect(svg).toHaveAttribute('aria-hidden', 'true');
      expect(svg).toHaveAttribute('focusable', 'false');
    }
    const gradients = [...journey().querySelectorAll('linearGradient')].map((node) => node.id);
    expect(new Set(gradients).size).toBe(gradients.length);
    for (const id of gradients) expect(id).toMatch(/^ohw-/);
  });

  it('adds no banned word, shown or spoken', () => {
    renderPage();
    const spoken = within(journey())
      .getAllByRole('link')
      .map((link) => link.getAttribute('aria-label'));
    const words = [journey().textContent, journey().getAttribute('aria-label'), ...spoken].join(
      ' '
    );
    for (const pattern of HERO_BANNED) expect(words).not.toMatch(pattern);
  });

  it('shows the finished journey, with no timers, where nothing can animate', () => {
    const frames = vi.spyOn(window, 'requestAnimationFrame');
    const intervals = vi.spyOn(window, 'setInterval');
    renderHero();
    expect(journey()).toHaveAttribute('data-still', 'true');
    expect(journey()).toHaveAttribute('data-phase', 'hold');
    expect(stationStates()).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(journey().querySelector('.ohw-clock')).toBeNull();
    expect(journey().querySelector('.ohw-pulse')).toBeNull();
    // The line is lit to its end: nothing of it is still to come.
    for (const line of journey().querySelectorAll('.ohw-lit')) {
      expect(line.style.getPropertyValue('--to')).toBe('0');
    }
    expect(frames).not.toHaveBeenCalled();
    expect(intervals).not.toHaveBeenCalled();
  });

  it('shows the same finished journey under reduced motion', () => {
    stubLiveBrowser({ reducedMotion: true });
    const frames = vi.spyOn(window, 'requestAnimationFrame');
    const intervals = vi.spyOn(window, 'setInterval');
    renderHero();
    expect(journey()).toHaveAttribute('data-still', 'true');
    expect(stationStates()).toEqual(['done', 'done', 'done', 'done', 'done']);
    expect(journey().querySelector('.ohw-clock')).toBeNull();
    expect(journey().querySelector('.ohw-pulse')).toBeNull();
    expect(frames).not.toHaveBeenCalled();
    expect(intervals).not.toHaveBeenCalled();
  });

  it('wakes the stations one by one, holds the finished journey, then starts over', () => {
    stubLiveBrowser();
    const frames = vi.spyOn(window, 'requestAnimationFrame');
    const intervals = vi.spyOn(window, 'setInterval');
    renderHero();
    expect(journey()).toHaveAttribute('data-still', 'false');
    expect(journey()).toHaveAttribute('data-seen', 'true');
    expect(stationStates()).toEqual(['idle', 'idle', 'idle', 'idle', 'idle']);
    expect(journey().querySelectorAll('.ohw-pulse')).toHaveLength(3);

    endBeat(); // the light reaches the first station
    expect(stationStates()).toEqual(['now', 'idle', 'idle', 'idle', 'idle']);
    endBeat(); // its scene has played; the light leaves, the station stays awake
    expect(stationStates()).toEqual(['now', 'idle', 'idle', 'idle', 'idle']);
    endBeat(); // the light reaches the second station, the first settles
    expect(stationStates()).toEqual(['done', 'now', 'idle', 'idle', 'idle']);

    for (let beat = 3; beat < 10; beat += 1) endBeat();
    expect(journey()).toHaveAttribute('data-phase', 'hold');
    expect(stationStates()).toEqual(['done', 'done', 'done', 'done', 'done']);
    endBeat();
    expect(journey()).toHaveAttribute('data-phase', 'reset');
    expect(stationStates()).toEqual(['idle', 'idle', 'idle', 'idle', 'idle']);
    endBeat();
    expect(journey()).toHaveAttribute('data-phase', 'run');
    endBeat();
    expect(stationStates()).toEqual(['now', 'idle', 'idle', 'idle', 'idle']);

    // The travelling light is decoration: it never takes focus, and it needs no timer.
    expect(document.body).toHaveFocus();
    expect(frames).not.toHaveBeenCalled();
    expect(intervals).not.toHaveBeenCalled();
  });

  it('glides a plain click to the step and hands it the keyboard', () => {
    stubLiveBrowser();
    const pushState = vi.spyOn(window.history, 'pushState').mockImplementation(() => {});
    const { container } = renderPage();
    const step = container.querySelector('#how-step-03');
    step.scrollIntoView = vi.fn();
    const link = within(journey()).getByRole('link', { name: /^Ask\./ });

    expect(fireEvent.click(link)).toBe(false);
    expect(step.scrollIntoView).toHaveBeenCalledWith({ behavior: 'smooth', block: 'start' });
    expect(step).toHaveFocus();
    expect(pushState).toHaveBeenCalledWith(null, '', '#how-step-03');

    // A click meant for a new tab is the browser's business.
    expect(fireEvent.click(link, { metaKey: true })).toBe(true);
    expect(step.scrollIntoView).toHaveBeenCalledTimes(1);
  });

  it('leaves the jump to the link itself under reduced motion', () => {
    stubLiveBrowser({ reducedMotion: true });
    const { container } = renderPage();
    const step = container.querySelector('#how-step-05');
    step.scrollIntoView = vi.fn();
    const link = within(journey()).getByRole('link', { name: /^Review\./ });
    expect(fireEvent.click(link)).toBe(true);
    expect(step.scrollIntoView).not.toHaveBeenCalled();
  });
});
