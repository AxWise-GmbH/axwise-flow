import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import HowHero from './HowHero';

/*
 * HowHero is not on any page now: the owner took it off "How it works" (2026-09-21). It
 * stays here, tested on its own, so it can come back with one import.
 */

const STEPS = [
  'Say what you need',
  'It makes a plan',
  'It asks when it needs you',
  'It works on your Mac',
  'You review the result',
];

// The word on each station of the opening picture, in step order.
const STATIONS = ['Say', 'Plan', 'Ask', 'Work', 'Review'];

const HERO_BANNED = [
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
  /\bplanned\b/i,
  /\bsoon\b/i,
  /\bcoming\b/i,
  /guaranteed/i,
  /times faster/i,
];

function Hero() {
  return (
    <HowHero
      id="how-heading"
      tag="How it works"
      title="You say it. It does it."
      line="One conversation."
      steps={STEPS.map((title, index) => ({ number: `0${index + 1}`, title }))}
    />
  );
}

function renderHero() {
  return render(<Hero />);
}

// The hero beside the steps its stations jump to, the way a page would place them.
function renderWithSteps() {
  return render(
    <>
      <Hero />
      <ol>
        {STEPS.map((title, index) => (
          <li key={title} id={`how-step-0${index + 1}`} tabIndex={-1}>
            {title}
          </li>
        ))}
      </ol>
    </>
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

describe('HowHero (kept, not on a page)', () => {
  it('keeps the title inside the shared frame and draws the journey beside it', () => {
    const { container } = renderHero();
    const hero = container.querySelector('section.oph');
    expect(hero).toHaveAttribute('aria-labelledby', 'how-heading');
    expect(within(hero).getByRole('heading', { level: 1 })).toHaveTextContent(
      'You say it. It does it.'
    );
    expect(within(hero).getByText('How it works')).toHaveClass('oi-tag-bracket');
    expect(hero.querySelector('.oph-visual')).toContainElement(journey());
  });

  it('links five stations, in step order, each to its step of the story', () => {
    renderHero();
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
      // The name starts with the word that is shown, then says which step it opens.
      expect(link).toHaveAccessibleName(
        `${STATIONS[index]}. Step ${index + 1} of 5: ${STEPS[index]}`
      );
      expect(link.querySelector('.ohw-name').textContent).toBe(STATIONS[index]);
      expect(link.querySelector('.ohw-num').textContent).toBe(`0${index + 1}`);
    });
  });

  it('is drawn with hidden inline SVG only', () => {
    renderHero();
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
    renderHero();
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
    const { container } = renderWithSteps();
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
    const { container } = renderWithSteps();
    const step = container.querySelector('#how-step-05');
    step.scrollIntoView = vi.fn();
    const link = within(journey()).getByRole('link', { name: /^Review\./ });
    expect(fireEvent.click(link)).toBe(true);
    expect(step.scrollIntoView).not.toHaveBeenCalled();
  });
});
