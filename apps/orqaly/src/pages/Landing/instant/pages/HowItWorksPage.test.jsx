import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { ThemeProvider } from '@mui/material/styles';
import { MemoryRouter } from 'react-router-dom';
import { instantTheme } from '../instantTheme';
import HowItWorksPage from './HowItWorksPage';

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

function renderPage() {
  return render(
    <ThemeProvider theme={instantTheme}>
      <MemoryRouter>
        <HowItWorksPage />
      </MemoryRouter>
    </ThemeProvider>
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

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('HowItWorksPage', () => {
  it('opens straight on the story: no opening picture, no tag, its heading the page title', () => {
    const { container } = renderPage();
    // The owner took the opening block ("You say it. It does it.") and the rule under it off.
    expect(container.querySelector('section.oph')).toBeNull();
    expect(screen.queryByRole('navigation', { name: 'The five steps' })).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(/You say it\. It does it\./);

    const first = container.querySelector('section');
    expect(first).toHaveAttribute('id', 'how-steps');
    expect(first).not.toHaveClass('ois-ruled');
    const titles = screen.getAllByRole('heading', { level: 1 });
    expect(titles).toHaveLength(1);
    expect(titles[0]).toHaveTextContent('Five steps, one chat');
    expect(titles[0]).toHaveAttribute('id', 'how-steps-heading');
    // Nothing above the heading: the owner took the "From request to result" tag off too.
    expect(container.textContent).not.toMatch(/From request to result/i);
    expect(first.querySelector('.hiw-head .oi-tag')).toBeNull();
  });

  it('heads "You set the rules" with its title alone, no [ Control ] tag above it', () => {
    const { container } = renderPage();
    const section = container.querySelector('#how-control');
    expect(within(section).getByRole('heading', { level: 2 })).toHaveTextContent(
      'You set the rules'
    );
    expect(section.querySelector('.oi-tag-bracket')).toBeNull();
    expect(within(section).queryByText('Control')).toBeNull();
  });

  it('tells the five steps in order, each a title and one line', () => {
    const { container } = renderPage();
    const section = container.querySelector('#how-steps');
    expect(section).toHaveAttribute('aria-labelledby', 'how-steps-heading');
    expect(
      within(section).getByRole('heading', { level: 1, name: 'Five steps, one chat' })
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

  it('lights the first step on arrival, before any scroll, since the page opens on the story', () => {
    stubLiveBrowser();
    const frames = [];
    vi.stubGlobal('requestAnimationFrame', (callback) => frames.push(callback));
    vi.stubGlobal('cancelAnimationFrame', () => {});
    // The rail starts under the heading, and the first step sits below the reading line
    // (0.64 of jsdom's 768px window), as it does on a laptop screen.
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function box() {
      const at = [...document.querySelectorAll('.hiw-node')].indexOf(this);
      if (this.classList.contains('hiw-rail')) return { top: 400, height: 3000 };
      if (at >= 0) return { top: 650 + at * 600, height: 16 };
      return { top: 0, height: 0, left: 0, width: 0 };
    });
    const { container } = renderPage();
    for (let frame = 0; frame < 400 && frames.length > 0; frame += 1) {
      const next = frames.shift();
      act(() => next(performance.now()));
    }
    const states = [...container.querySelectorAll('.hiw-step')].map((step) =>
      step.getAttribute('data-state')
    );
    expect(states).toEqual(['now', 'next', 'next', 'next', 'next']);
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
    const sections = [...container.querySelectorAll('section.oi-section')];
    sections.forEach((section, index) => {
      const heading = container.querySelector(`#${section.getAttribute('aria-labelledby')}`);
      // The first section opens the page, so its heading is the page's one h1.
      expect(heading?.tagName).toBe(index === 0 ? 'H1' : 'H2');
      expect(section.contains(heading)).toBe(true);
    });
    const ids = [...container.querySelectorAll('[id]')].map((node) => node.id);
    expect(new Set(ids).size).toBe(ids.length);
    // Ids that belong to the sections this page reuses or links to; the page's own stay clear.
    const taken = ['speed', 'control', 'what-stays', 'download', 'watch', 'questions', 'use-cases'];
    const own = ids.filter((id) => id.startsWith('how-') && id !== 'how-it-works');
    expect(own).toEqual([
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
