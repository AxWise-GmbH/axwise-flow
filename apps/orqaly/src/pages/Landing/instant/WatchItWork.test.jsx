import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WatchItWork from './WatchItWork';
import { PLANNED_PATTERN } from './capabilities.data';
import { SCENES } from './watchItWork.scenes';
import { BUILD_MS, INTRO_MS, RESULTS_MS, TICK_MS, filmOption } from './watchItWorkMachine';

/*
 * The owner, 2026-09-21: "Watch it work" only plays. It asks the visitor for nothing: no
 * Play / Skip / Replay / Download buttons, nothing to click inside the window. The film makes
 * its own picks and loops through the four examples. The example tabs came back (owner: "why
 * you remove tabs"): they follow the film, and a click only jumps ahead. One round pause icon
 * stays, because motion that starts by itself has to be stoppable.
 */

const [BUSINESS, PRODUCT, CAMPAIGN, REVIEW] = SCENES;

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function mockReducedMotion() {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({
      matches: query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
    }))
  );
}

// A browser that reports the demo on screen, and can take it off screen and back again.
function stubViewport() {
  const observers = [];
  vi.stubGlobal(
    'IntersectionObserver',
    class {
      constructor(callback) {
        this.callback = callback;
        observers.push(this);
      }
      observe(target) {
        this.target = target;
        this.callback([{ target, isIntersecting: true }]);
      }
      disconnect() {}
    }
  );
  return (visible) =>
    act(() => {
      for (const observer of observers) {
        observer.callback([{ target: observer.target, isIntersecting: visible }]);
      }
    });
}

function setup({ onScreen = true } = {}) {
  vi.useFakeTimers();
  const setVisible = onScreen ? stubViewport() : null;
  const interval = vi.spyOn(window, 'setInterval');
  const clear = vi.spyOn(window, 'clearInterval');
  const view = render(<WatchItWork />);
  return { ...view, interval, clear, setVisible, demo: view.container.querySelector('.wiw') };
}

// One step per act, the way a browser renders between timer callbacks.
function play(ms, step = TICK_MS) {
  for (let elapsed = 0; elapsed < ms; elapsed += step) {
    act(() => vi.advanceTimersByTime(step));
  }
}

// Plays until `done` holds, and fails if that takes longer than `within` ms.
function playUntil(done, withinMs = 30_000, step = TICK_MS) {
  for (let elapsed = 0; elapsed <= withinMs; elapsed += step) {
    if (done()) return elapsed;
    act(() => vi.advanceTimersByTime(step));
  }
  throw new Error(`still waiting after ${withinMs} ms`);
}

function expectEveryIntervalCleared(interval, clear) {
  for (const { value } of interval.mock.results) expect(clear).toHaveBeenCalledWith(value);
}

const demo = () => document.querySelector('.wiw');
const pauseButton = () => screen.getByRole('button', { name: /^(Pause|Play) demo$/ });
const tab = (scene) => screen.getByRole('button', { name: scene.label });
const nodeIs = (name) => () => demo().dataset.node === name;
const app = () => document.querySelector('.wiw-app');
const requestIs = (scene) => () =>
  document.querySelector('.wiw-user')?.textContent === scene.request &&
  demo().dataset.node === 'gate';
// The window is hidden from assistive tech, so its parts are found with hidden: true.
const workspace = () => screen.getByRole('complementary', { name: 'Workspace', hidden: true });
const roadmapSteps = () =>
  within(screen.getByRole('list', { name: 'Roadmap', hidden: true })).getAllByRole('listitem', {
    hidden: true,
  });
const fileRows = () =>
  within(screen.getByRole('list', { name: 'Files', hidden: true })).getAllByRole('listitem', {
    hidden: true,
  });
const picks = (scene) =>
  scene.questions.map((question, index) => question.options[filmOption(scene, index)]);

describe('WatchItWork', () => {
  it('heads the demo with its title and one short line, and tells the film in words', () => {
    setup();
    expect(demo()).toHaveAttribute('id', 'watch');
    expect(demo()).toHaveAccessibleName('Watch it work');
    expect(screen.getByRole('heading', { level: 2, name: 'Watch it work' })).toBeInTheDocument();
    expect(screen.getByText('Example demo · sped up')).toBeInTheDocument();
    // The window changes by itself, so it is hidden from screen readers; this says it instead.
    expect(screen.getByText(/^A sped-up example that plays by itself:/)).toHaveClass(
      'oi-sr-only'
    );
    // Owner, 2026-09-21: the More under the heading is gone.
    expect(screen.queryByRole('button', { name: 'More' })).not.toBeInTheDocument();
  });

  it('asks the visitor for nothing: only the example tabs and the pause icon, nothing in the window', () => {
    const { container } = setup();
    const tabs = within(screen.getByRole('group', { name: 'Examples' })).getAllByRole('button');
    expect(tabs.map((button) => button.textContent)).toEqual(SCENES.map((scene) => scene.label));
    expect(screen.getAllByRole('button')).toHaveLength(SCENES.length + 1);
    expect(pauseButton()).toHaveAccessibleName('Pause demo');
    expect(pauseButton().textContent).toBe('');
    expect(screen.queryAllByRole('link')).toHaveLength(0);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(container.textContent).not.toMatch(
      /Choose an example|Play from the start|Skip to results|Replay|Resume|Download/i
    );

    expect(app()).toHaveAttribute('aria-hidden', 'true');
    expect(app()).toHaveAttribute('inert');
    const operable = 'a, button, input, select, textarea, form, label, summary, [tabindex]';
    expect(app().querySelectorAll(operable)).toHaveLength(0);

    // Still true once the cards with the picks are on screen.
    playUntil(nodeIs('answer'));
    expect(app().querySelectorAll(operable)).toHaveLength(0);
    expect(app().querySelectorAll('.wiw-option')).not.toHaveLength(0);
  });

  it('rests on its first frame, with no timer, until it is on screen', () => {
    const { container, interval } = setup({ onScreen: false });
    const before = container.innerHTML;
    act(() => vi.advanceTimersByTime(120_000));
    expect(demo()).toHaveAttribute('data-playback', 'idle');
    expect(demo()).toHaveAttribute('data-node', 'gate');
    expect(container.innerHTML).toBe(before);
    expect(interval).not.toHaveBeenCalled();

    expect(container.querySelector('.wiw-user')).toHaveTextContent(BUSINESS.request);
    expect(workspace()).toHaveTextContent('Needs you');
    expect(roadmapSteps().map((step) => step.dataset.state)).toEqual([
      'now',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(container.querySelector('img, iframe, video, canvas')).toBeNull();
  });

  it('plays the whole example by itself: types, plans, picks, answers, builds, shows the pack', () => {
    const { container, interval, clear } = setup();
    playUntil(nodeIs('intro'), 2000);
    play(1000);
    const typed = container.querySelector('.wiw-user').childNodes[0].textContent;
    expect(typed.length).toBeGreaterThan(0);
    expect(typed.length).toBeLessThan(BUSINESS.request.length);
    expect(BUSINESS.request.startsWith(typed)).toBe(true);

    playUntil(nodeIs('gate'), INTRO_MS);
    expect(container).toHaveTextContent(BUSINESS.planReply);
    expect(container).toHaveTextContent(BUSINESS.askLine);
    // The film picks "Sure, ask me" in the app's card, then starts.
    playUntil(() => container.querySelector('.wiw-choice[data-checked="true"]'), 3000);
    expect(container.querySelector('.wiw-choice[data-checked="true"]')).toHaveTextContent(
      'Sure, ask me'
    );
    expect(container.querySelector('.wiw-card-foot .wiw-button')).toHaveAttribute(
      'data-ready',
      'true'
    );

    // It answers the three questions one by one, then sends them.
    playUntil(nodeIs('answer'), 3000);
    expect(container).toHaveTextContent('0 of 3 answered');
    playUntil(() => container.textContent.includes('1 of 3 answered'), 2000);
    playUntil(() => container.textContent.includes('3 of 3 answered'), 3000);
    const chosen = [...container.querySelectorAll('.wiw-option[data-picked="true"]')];
    expect(chosen.map((chip) => chip.textContent)).toEqual(picks(BUSINESS));
    expect(container).toHaveTextContent('Send 3 answers');

    playUntil(nodeIs('build'), 2000);
    expect(container).toHaveTextContent('Your Turn to Answer · Answers sent');
    expect(workspace()).toHaveTextContent('Working');
    play(BUILD_MS / 2);
    expect(workspace()).toHaveTextContent('Step 3 of 5');
    expect(roadmapSteps().map((step) => step.dataset.state)).toEqual([
      'done',
      'done',
      'now',
      'pending',
      'pending',
    ]);

    playUntil(nodeIs('results'), BUILD_MS);
    expect(container.querySelector('.wiw-window')).toHaveAttribute('data-fading', 'true');
    playUntil(nodeIs('complete'), RESULTS_MS + TICK_MS);
    expect(container.querySelector('.wiw-window')).toBeNull();
    expect(container).toHaveTextContent(BUSINESS.pack.title);
    expect(screen.getByText(`fitted to: ${picks(BUSINESS).join(' · ')}`)).toBeInTheDocument();
    expect(screen.getByText('Drafts to review, not legal or financial advice.')).toBeVisible();
    for (const column of BUSINESS.pack.columns) {
      const items = within(
        screen.getByRole('region', { name: column.title, hidden: true })
      ).getAllByRole('listitem', { hidden: true });
      expect(items.map((item) => item.textContent)).toEqual(column.items);
    }
    expect(container.textContent).not.toMatch(/\d:\d\d/);
    expect(container.textContent).not.toMatch(/Answer 3 questions/);
    expectEveryIntervalCleared(interval, clear);
  });

  it('moves on to the next example by itself, and loops back to the first', () => {
    setup();
    for (const scene of [PRODUCT, CAMPAIGN, REVIEW, BUSINESS]) {
      playUntil(requestIs(scene), 40_000, 200);
      expect(document.querySelector('.wiw-title')).toHaveTextContent(scene.chatTitle);
      expect(demo()).toHaveAttribute('data-playback', 'idle');
      // Each one starts unpicked and plays again.
      expect(document.querySelector('.wiw-choice[data-checked="true"]')).toBeNull();
      playUntil(nodeIs('intro'), 2000);
    }
  });

  it('rests while off screen and picks up where it stood when it is back', () => {
    const { container, setVisible, interval, clear } = setup();
    playUntil(nodeIs('build'));
    play(2000);
    setVisible(false);
    expect(demo()).toHaveAttribute('data-playback', 'paused');
    const before = container.innerHTML;
    act(() => vi.advanceTimersByTime(10_000));
    expect(container.innerHTML).toBe(before);

    setVisible(true);
    // The director resumes on the next turn of the timers.
    act(() => vi.advanceTimersByTime(0));
    expect(demo()).toHaveAttribute('data-playback', 'playing');
    // 2000 ms of the build were played, so it ends 2200 ms after coming back: not sooner
    // (the clock kept its place) and not later (it did not start over).
    play(BUILD_MS - 2000 - 2 * TICK_MS);
    expect(demo()).toHaveAttribute('data-node', 'build');
    play(3 * TICK_MS);
    expect(demo()).toHaveAttribute('data-node', 'results');
    playUntil(nodeIs('complete'), RESULTS_MS + TICK_MS);
    expectEveryIntervalCleared(interval, clear);
  });

  it('lights the playing example tab, which follows the film and fills as the scene runs', () => {
    const { container } = setup();
    expect(tab(BUSINESS)).toHaveAttribute('aria-pressed', 'true');
    expect(tab(PRODUCT)).toHaveAttribute('aria-pressed', 'false');
    const fill = () => Number(tab(BUSINESS).style.getPropertyValue('--wiw-progress'));
    const start = fill();
    playUntil(nodeIs('build'));
    expect(fill()).toBeGreaterThan(start);
    expect(tab(PRODUCT).style.getPropertyValue('--wiw-progress')).toBe('');

    playUntil(requestIs(PRODUCT));
    expect(tab(PRODUCT)).toHaveAttribute('aria-pressed', 'true');
    expect(tab(BUSINESS)).toHaveAttribute('aria-pressed', 'false');
    expect(container.querySelectorAll('.wiw-pill[aria-pressed="true"]')).toHaveLength(1);
  });

  it('jumps to an example on a tab click and keeps playing from there', () => {
    setup();
    playUntil(nodeIs('intro'));
    fireEvent.click(tab(CAMPAIGN));
    expect(tab(CAMPAIGN)).toHaveAttribute('aria-pressed', 'true');
    expect(demo()).toHaveAttribute('data-paused', 'false');
    expect(pauseButton()).toHaveAccessibleName('Pause demo');
    playUntil(nodeIs('intro'), 2000);
    playUntil(requestIs(CAMPAIGN), 8000);
    playUntil(nodeIs('build'));

    // Arrow keys move along the tabs too.
    fireEvent.keyDown(tab(CAMPAIGN), { key: 'ArrowRight' });
    expect(tab(REVIEW)).toHaveAttribute('aria-pressed', 'true');
    expect(tab(REVIEW)).toHaveFocus();
  });

  it("shows the picked example's finished pack when a tab is clicked while paused", () => {
    const { container } = setup();
    fireEvent.click(pauseButton());
    fireEvent.click(tab(REVIEW));
    expect(demo()).toHaveAttribute('data-node', 'complete');
    expect(container).toHaveTextContent(REVIEW.pack.title);
    expect(pauseButton()).toHaveAccessibleName('Play demo');
  });

  it('stops on the pause icon and plays on from the same place', () => {
    const { container, interval } = setup();
    const toggle = pauseButton();
    playUntil(() => container.textContent.includes('1 of 3 answered'));

    fireEvent.click(toggle);
    expect(toggle).toHaveAccessibleName('Play demo');
    expect(demo()).toHaveAttribute('data-paused', 'true');
    const before = container.innerHTML;
    const intervals = interval.mock.calls.length;
    act(() => vi.advanceTimersByTime(20_000));
    // No more picks while paused, and no clock running.
    expect(container.innerHTML).toBe(before);
    expect(interval.mock.calls.length).toBe(intervals);

    fireEvent.click(toggle);
    expect(toggle).toHaveAccessibleName('Pause demo');
    playUntil(() => container.textContent.includes('2 of 3 answered'), 2000);
    playUntil(nodeIs('build'), 4000);

    fireEvent.click(toggle);
    expect(demo()).toHaveAttribute('data-playback', 'paused');
    fireEvent.click(toggle);
    act(() => vi.advanceTimersByTime(0));
    expect(demo()).toHaveAttribute('data-playback', 'playing');
  });

  it('rests on the finished first example under reduced motion, with no timer', () => {
    mockReducedMotion();
    const { container, interval } = setup();
    expect(demo()).toHaveAttribute('data-node', 'complete');
    expect(container).toHaveTextContent(BUSINESS.pack.title);
    expect(screen.getByText(`fitted to: ${picks(BUSINESS).join(' · ')}`)).toBeInTheDocument();
    expect(pauseButton()).toHaveAccessibleName('Play demo');

    const before = container.innerHTML;
    act(() => vi.advanceTimersByTime(120_000));
    expect(container.innerHTML).toBe(before);
    expect(interval).not.toHaveBeenCalled();

    // The icon still lets someone watch it run.
    fireEvent.click(pauseButton());
    playUntil(requestIs(PRODUCT), 8000);
    playUntil(nodeIs('intro'), 2000);
  });

  it("lists the run's files under the roadmap and fills them in as their steps run", () => {
    setup();
    const files = screen.getByRole('region', { name: 'Files', hidden: true });
    expect(workspace()).toContainElement(files);
    // Under the roadmap, in the panel's own order.
    expect(
      screen.getByRole('list', { name: 'Roadmap', hidden: true }).compareDocumentPosition(files) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
    expect(files).toHaveTextContent('All 4');

    const names = () => fileRows().map((row) => row.querySelector('.wiw-ws-name').textContent);
    const states = () => fileRows().map((row) => row.dataset.state);
    const badges = () =>
      fileRows().map((row) => row.querySelector('.wiw-ws-badge')?.textContent ?? null);
    expect(names()).toEqual(BUSINESS.files.map((file) => file.name));
    expect(states()).toEqual(['waiting', 'waiting', 'waiting', 'waiting']);
    expect(badges()).toEqual([null, null, null, null]);
    expect(fileRows()[2]).toHaveTextContent('Web page · site');
    expect(fileRows()[3]).toHaveTextContent('Spreadsheet · team');

    playUntil(nodeIs('build'));
    play(BUILD_MS / 2);
    // Step 3 of 5 writes the business plan.
    expect(states()).toEqual(['writing', 'waiting', 'waiting', 'waiting']);
    expect(badges()).toEqual(['WRITING', null, null, null]);

    play((BUILD_MS * 2) / 5);
    // Step 5 of 5: the plan and both marketing files are done, the agents list is being written.
    expect(states()).toEqual(['done', 'done', 'done', 'writing']);
    expect(badges()).toEqual(['NEW', 'NEW', 'NEW', 'WRITING']);

    playUntil(requestIs(PRODUCT), 20_000, 200);
    expect(names()).toEqual(PRODUCT.files.map((file) => file.name));
    expect(states()).toEqual(['waiting', 'waiting', 'waiting']);
    expect(screen.getByRole('region', { name: 'Files', hidden: true })).toHaveTextContent('All 3');
    // The PDF wears the app's corner tag on its tile, and says so in words beside it.
    const roadmap = fileRows()[2];
    expect(roadmap.querySelector('.wiw-ws-tag')).toHaveTextContent('PDF');
    expect(roadmap.querySelector('.wiw-ws-tile')).toHaveAttribute('aria-hidden', 'true');
    expect(roadmap).toHaveTextContent('PDF · plan');
    expect(fileRows()[1]).toHaveTextContent('Image · design');
    expect(demo().querySelector('img, iframe, video, canvas')).toBeNull();
  });

  it('keeps the files hidden until the plan arrives in the typed intro', () => {
    setup();
    playUntil(nodeIs('intro'), 2000);
    const files = document.querySelector('.wiw-ws-files');
    expect(files).toHaveAttribute('data-arrived', 'false');
    play(INTRO_MS - 1000);
    expect(files).toHaveAttribute('data-arrived', 'true');
  });

  it("wears the desktop app's sidebar as scenery: hidden, exact labels, nothing focusable", () => {
    const { container } = setup();
    const sidebar = container.querySelector('.wiw-sidebar');
    expect(sidebar).toHaveAttribute('aria-hidden', 'true');

    const labels = () => [...sidebar.querySelectorAll('.wiw-side-text')].map((t) => t.textContent);
    const expected = (chatTitle) => [
      'Orqanix',
      'New Chat',
      'RECENT',
      chatTitle,
      'Getting started',
      'PINNED',
      'Brand guide',
      'Intelligence',
      'Plugins',
      'Instruments',
      'History',
      'Settings',
    ];
    expect(labels()).toEqual(expected(BUSINESS.chatTitle));
    // No words outside the labelled spans.
    expect(sidebar.textContent).toBe(expected(BUSINESS.chatTitle).join(''));
    expect(sidebar.querySelector('[data-selected="true"]')).toHaveTextContent(BUSINESS.chatTitle);
    for (const row of sidebar.querySelectorAll('*')) {
      expect(['SPAN', 'I', 'svg', 'path', 'line']).toContain(row.tagName);
    }
    for (const glyph of sidebar.querySelectorAll('svg')) {
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
      expect(glyph).toHaveAttribute('focusable', 'false');
    }

    playUntil(requestIs(PRODUCT), 40_000, 200);
    expect(labels()).toEqual(expected(PRODUCT.chatTitle));
  });

  it('keeps the app window standing while the chat fades and the pack rises inside it', () => {
    const { container } = setup();
    const window_ = container.querySelector('.wiw-app');
    expect(window_.querySelector('.wiw-window')).not.toBeNull();
    expect(window_.querySelector('.wiw-composer')).toHaveAttribute('aria-hidden', 'true');

    playUntil(nodeIs('complete'));
    expect(container.querySelector('.wiw-app')).toBe(window_);
    expect(window_.querySelector('.wiw-window')).toBeNull();
    expect(window_.querySelector('.wiw-sidebar')).not.toBeNull();
    expect(window_.querySelector('.wiw-title')).toHaveTextContent(BUSINESS.chatTitle);
    expect(window_.querySelector('.wiw-pack-title')).toHaveTextContent(BUSINESS.pack.title);
  });

  it('labels each moment with a decorative callout', () => {
    const { container } = setup();
    const shown = () =>
      [...container.querySelectorAll('.wiw-callout[data-visible="true"]')].map(
        (callout) => callout.textContent
      );
    for (const callout of container.querySelectorAll('.wiw-callout, .wiw-caption')) {
      expect(callout).toHaveAttribute('aria-hidden', 'true');
    }
    expect(shown()).toEqual(['It asks first', 'The plan']);
    expect(container.querySelector('.wiw-caption')).toHaveTextContent('It asks first · The plan');

    playUntil(nodeIs('answer'));
    expect(shown()).toEqual([]);
    playUntil(nodeIs('build'));
    expect(shown()).toEqual(['Workspace opens']);
    playUntil(nodeIs('results'));
    expect(shown()).toEqual(['Your files']);
    playUntil(nodeIs('complete'));
    expect(shown()).toEqual(['Your files']);
    expect(container.querySelector('.wiw-caption')).toHaveTextContent('Your files');
    expect(demo().textContent).not.toMatch(PLANNED_PATTERN);
  });

  it('clears its interval when it unmounts mid-run', () => {
    const { interval, clear, unmount } = setup();
    playUntil(nodeIs('build'));
    play(BUILD_MS / 4);
    unmount();
    expect(interval).toHaveBeenCalled();
    expectEveryIntervalCleared(interval, clear);
  });
});
