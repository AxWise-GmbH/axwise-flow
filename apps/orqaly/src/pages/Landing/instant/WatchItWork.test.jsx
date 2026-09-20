import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import WatchItWork from './WatchItWork';
import { PLANNED_PATTERN } from './capabilities.data';
import { DESKTOP_RELEASE } from '../simple/desktop-release';
import { SCENES } from './watchItWork.scenes';
import { BUILD_MS, INTRO_MS, QUESTION_MS, RESULTS_MS, TICK_MS } from './watchItWorkMachine';

const [BUSINESS, PRODUCT] = SCENES;

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

function setup() {
  vi.useFakeTimers();
  const interval = vi.spyOn(window, 'setInterval');
  const clear = vi.spyOn(window, 'clearInterval');
  const view = render(<WatchItWork />);
  return { ...view, interval, clear, demo: view.container.querySelector('.wiw') };
}

// One tick per act, the way a browser renders between interval callbacks.
function play(ms) {
  for (let elapsed = 0; elapsed < ms; elapsed += TICK_MS) {
    act(() => vi.advanceTimersByTime(TICK_MS));
  }
}

function expectEveryIntervalCleared(interval, clear) {
  for (const { value } of interval.mock.results) expect(clear).toHaveBeenCalledWith(value);
}

const button = (name) => screen.getByRole('button', { name });
const control = () => document.querySelector('.wiw-control');

function startWith(choice) {
  fireEvent.click(screen.getByRole('radio', { name: choice }));
  fireEvent.click(button('Start'));
}

function pick(question, option) {
  fireEvent.click(
    within(screen.getByRole('group', { name: question })).getByRole('button', { name: option })
  );
}

describe('WatchItWork', () => {
  it('opens on the first frame: request, plan, the real choice card and the Workspace', () => {
    const { container, demo } = setup();
    expect(demo).toHaveAttribute('id', 'watch');
    expect(demo).toHaveAccessibleName('Watch it work');
    expect(screen.getByRole('heading', { level: 2, name: 'Watch it work' })).toBeInTheDocument();
    expect(screen.getByText('Example demo · sped up')).toBeInTheDocument();

    expect(demo).toHaveTextContent(BUSINESS.request);
    expect(screen.getByText(BUSINESS.askLine)).toBeInTheDocument();
    expect(demo).toHaveTextContent(BUSINESS.planReply);

    const choices = screen.getByRole('radiogroup', { name: 'Choose a next step' });
    expect(within(choices).getAllByRole('radio')).toHaveLength(2);
    expect(within(choices).getByRole('radio', { name: 'Sure, ask me' })).not.toBeChecked();
    expect(
      within(choices).getByRole('radio', { name: 'Proceed with assumptions' })
    ).not.toBeChecked();
    expect(screen.queryByText(/Your Turn to Answer/)).not.toBeInTheDocument();

    const workspace = screen.getByRole('complementary', { name: 'Workspace' });
    expect(workspace).toHaveTextContent('Needs you');
    expect(workspace).toHaveTextContent('Step 1 of 5');
    expect(workspace).toHaveTextContent('Roadmap');
    const steps = within(workspace).getAllByRole('listitem');
    expect(steps.map((step) => step.dataset.state)).toEqual([
      'now',
      'pending',
      'pending',
      'pending',
      'pending',
    ]);
    expect(steps.map((step) => step.textContent)).toEqual(
      BUSINESS.steps.map((step, index) => (index === 0 ? `${step}, now` : step))
    );

    expect(container.querySelector('img, iframe, video, canvas')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Download for macOS' })).not.toBeInTheDocument();
  });

  it('keeps the honesty note one click away, with the exact wording', () => {
    setup();
    const note = screen.getByText(/^Scripted example\./);
    expect(note).toHaveTextContent(
      'Scripted example. Real runs take minutes and give you drafts to review, not legal or financial advice. "Proceed" makes the same pack with general assumptions.'
    );
    expect(note).not.toBeVisible();
    fireEvent.click(button('More'));
    expect(note).toBeVisible();
    expect(button('Less')).toHaveAttribute('aria-expanded', 'true');
  });

  it('never starts by itself: idle, unchanged and without a timer after two minutes', () => {
    const { container, demo, interval } = setup();
    const before = container.innerHTML;
    act(() => vi.advanceTimersByTime(120_000));
    expect(demo).toHaveAttribute('data-playback', 'idle');
    expect(demo).toHaveAttribute('data-node', 'gate');
    expect(container.innerHTML).toBe(before);
    expect(interval).not.toHaveBeenCalled();
    expect(control()).toHaveTextContent('Play from the start');
  });

  it('keeps Start disabled until one of the two rows is chosen', () => {
    const { demo } = setup();
    expect(button('Start')).toBeDisabled();
    fireEvent.click(button('Start'));
    expect(demo).toHaveAttribute('data-node', 'gate');

    fireEvent.click(screen.getByRole('radio', { name: 'Proceed with assumptions' }));
    fireEvent.click(screen.getByRole('radio', { name: 'Sure, ask me' }));
    expect(screen.getByRole('radio', { name: 'Sure, ask me' })).toBeChecked();
    expect(screen.getByRole('radio', { name: 'Proceed with assumptions' })).not.toBeChecked();
    expect(button('Start')).toBeEnabled();
    expect(demo).toHaveAttribute('data-playback', 'idle');
  });

  it('asks first, then waits for the visitor for as long as it takes', () => {
    const { container, demo, interval, clear } = setup();
    startWith('Sure, ask me');
    expect(demo).toHaveAttribute('data-node', 'question');
    expect(screen.getByRole('heading', { name: 'Your Turn to Answer' })).toHaveFocus();
    expect(screen.getByRole('heading', { name: 'Choose a next step · Started' })).toBeVisible();
    expect(screen.queryByRole('radio')).not.toBeInTheDocument();

    play(QUESTION_MS + TICK_MS);
    expect(demo).toHaveAttribute('data-node', 'answer');
    expect(demo).toHaveAttribute('data-playback', 'awaiting');
    expect(screen.getByRole('heading', { name: 'Your Turn to Answer' })).toHaveFocus();
    expect(screen.getByText('0 of 3 answered')).toBeInTheDocument();
    expect(button('Send')).toBeDisabled();
    for (const question of BUSINESS.questions) {
      const options = within(screen.getByRole('group', { name: question.label })).getAllByRole(
        'button'
      );
      expect(options.map((option) => option.textContent)).toEqual(question.options);
      for (const option of options) expect(option).toHaveAttribute('aria-pressed', 'false');
    }
    expect(screen.getByRole('complementary', { name: 'Workspace' })).toHaveTextContent('Needs you');

    const before = container.innerHTML;
    act(() => vi.advanceTimersByTime(120_000));
    expect(container.innerHTML).toBe(before);
    expect(demo).toHaveAttribute('data-node', 'answer');
    expect(control()).toHaveTextContent('Skip to results');
    expect(interval).toHaveBeenCalledTimes(1);
    expectEveryIntervalCleared(interval, clear);
  });

  it('takes one answer per question and counts them on the Send button', () => {
    setup();
    startWith('Sure, ask me');
    play(QUESTION_MS + TICK_MS);

    pick('Where will you register?', 'Estonia');
    expect(screen.getByText('1 of 3 answered')).toBeInTheDocument();
    expect(button('Send 1 answer')).toBeEnabled();

    pick('Where will you register?', 'Latvia');
    const register = screen.getByRole('group', { name: 'Where will you register?' });
    expect(within(register).getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(within(register).getByRole('button', { name: 'Latvia' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(screen.getByText('1 of 3 answered')).toBeInTheDocument();

    pick('How much to start?', '€10–50k');
    expect(button('Send 2 answers')).toBeEnabled();
    pick('How will you sell?', 'Online');
    expect(screen.getByText('3 of 3 answered')).toBeInTheDocument();
    expect(button('Send 3 answers')).toBeEnabled();

    pick('How will you sell?', 'Online');
    expect(button('Send 2 answers')).toBeEnabled();
  });

  it('builds step by step after Send, goes dark, and ends on the fitted pack', () => {
    const { container, demo, interval, clear } = setup();
    startWith('Sure, ask me');
    play(QUESTION_MS + TICK_MS);
    pick('Where will you register?', 'Latvia');
    pick('How much to start?', '€10–50k');
    pick('How will you sell?', 'Online');
    fireEvent.click(button('Send 3 answers'));

    expect(demo).toHaveAttribute('data-node', 'build');
    expect(demo).toHaveAttribute('data-playback', 'playing');
    const sentHeading = screen.getByRole('heading', { name: /Your Turn to Answer/ });
    expect(sentHeading).toHaveTextContent('Your Turn to Answer · Answers sent');
    expect(sentHeading).toHaveFocus();
    expect(screen.queryByRole('group', { name: 'How will you sell?' })).not.toBeInTheDocument();
    const workspace = screen.getByRole('complementary', { name: 'Workspace' });
    expect(workspace).toHaveTextContent('Working');
    expect(workspace).toHaveTextContent('Step 1 of 5');
    expect(control()).toHaveTextContent('Pause demo');

    play(BUILD_MS / 2);
    expect(workspace).toHaveTextContent('Step 3 of 5');
    expect(
      within(workspace)
        .getAllByRole('listitem')
        .map((step) => step.dataset.state)
    ).toEqual(['done', 'done', 'now', 'pending', 'pending']);
    expect(container.textContent).not.toMatch(/\d:\d\d/);

    play(BUILD_MS / 2 + TICK_MS);
    expect(demo).toHaveAttribute('data-node', 'results');
    const fading = container.querySelector('.wiw-window');
    expect(fading).toHaveAttribute('data-fading', 'true');
    expect(fading).toHaveAttribute('aria-hidden', 'true');
    expect(fading).toHaveAttribute('inert');
    expect(screen.getByRole('heading', { name: BUSINESS.pack.title })).toHaveFocus();
    expect(screen.queryByRole('link', { name: 'Download for macOS' })).not.toBeInTheDocument();

    play(RESULTS_MS + TICK_MS);
    expect(demo).toHaveAttribute('data-node', 'complete');
    expect(demo).toHaveAttribute('data-playback', 'complete');
    expect(container.querySelector('.wiw-window')).toBeNull();
    expect(screen.getByText('fitted to: Latvia · €10–50k · Online')).toBeInTheDocument();
    expect(screen.getByText('Drafts to review, not legal or financial advice.')).toBeVisible();
    for (const column of BUSINESS.pack.columns) {
      const items = within(screen.getByRole('region', { name: column.title })).getAllByRole(
        'listitem'
      );
      expect(items.map((item) => item.textContent)).toEqual(column.items);
    }
    expect(control()).toHaveTextContent('Replay demo');
    expect(container.textContent).not.toMatch(/\d:\d\d/);

    expect(interval).toHaveBeenCalledTimes(3);
    expectEveryIntervalCleared(interval, clear);
    act(() => vi.advanceTimersByTime(120_000));
    expect(interval).toHaveBeenCalledTimes(3);
  });

  it('shows the Download link only once the demo is complete', () => {
    vi.useFakeTimers();
    render(<WatchItWork downloadDescriptionId="release-facts" />);
    startWith('Proceed with assumptions');
    play(BUILD_MS + TICK_MS);
    expect(screen.queryByRole('link', { name: 'Download for macOS' })).not.toBeInTheDocument();
    play(RESULTS_MS + TICK_MS);
    const download = screen.getByRole('link', { name: 'Download for macOS' });
    expect(download).toHaveAttribute('href', DESKTOP_RELEASE.url);
    expect(download).toHaveAttribute('download', DESKTOP_RELEASE.filename);
    expect(download).toHaveAttribute('aria-describedby', 'release-facts');
  });

  it('skips the questions on "Proceed with assumptions" and says so under the pack', () => {
    const { demo, interval, clear } = setup();
    startWith('Proceed with assumptions');
    expect(demo).toHaveAttribute('data-node', 'build');
    expect(screen.getByRole('heading', { name: 'Choose a next step · Started' })).toHaveFocus();
    expect(screen.queryByText(/Your Turn to Answer/)).not.toBeInTheDocument();

    play(BUILD_MS + TICK_MS);
    expect(screen.queryByText(/Your Turn to Answer/)).not.toBeInTheDocument();
    play(RESULTS_MS + TICK_MS);
    expect(demo).toHaveAttribute('data-node', 'complete');
    expect(
      screen.getByText('Made with general assumptions. Answer 3 questions to fit it to you.')
    ).toBeInTheDocument();
    expect(screen.queryByText(/^fitted to:/)).not.toBeInTheDocument();
    expect(interval).toHaveBeenCalledTimes(2);
    expectEveryIntervalCleared(interval, clear);
  });

  it('pauses without losing its place and resumes on a fresh, single interval', () => {
    const { container, demo, interval, clear } = setup();
    startWith('Proceed with assumptions');
    play(2000);
    fireEvent.click(control());
    expect(demo).toHaveAttribute('data-playback', 'paused');
    expect(control()).toHaveTextContent('Resume demo');
    expect(clear).toHaveBeenCalledWith(interval.mock.results[0].value);

    const before = container.innerHTML;
    act(() => vi.advanceTimersByTime(8000));
    expect(container.innerHTML).toBe(before);
    expect(screen.getByRole('complementary', { name: 'Workspace' })).toHaveTextContent(
      'Step 3 of 5'
    );

    fireEvent.click(control());
    expect(demo).toHaveAttribute('data-playback', 'playing');
    expect(interval).toHaveBeenCalledTimes(2);
    // 2000 ms were played before the pause, so build ends 2200 ms after the resume: not
    // sooner (the clock kept its place) and not later (it did not start over).
    play(BUILD_MS - 2000 - TICK_MS);
    expect(demo).toHaveAttribute('data-node', 'build');
    play(2 * TICK_MS);
    expect(demo).toHaveAttribute('data-node', 'results');
    play(RESULTS_MS + TICK_MS);
    expect(demo).toHaveAttribute('data-node', 'complete');
    expect(interval).toHaveBeenCalledTimes(3);
    expectEveryIntervalCleared(interval, clear);
  });

  it('replays from the untouched first frame', () => {
    const { demo, interval } = setup();
    startWith('Proceed with assumptions');
    play(BUILD_MS + TICK_MS);
    play(RESULTS_MS + TICK_MS);
    fireEvent.click(button('Replay demo'));

    expect(demo).toHaveAttribute('data-node', 'gate');
    expect(demo).toHaveAttribute('data-playback', 'idle');
    expect(screen.getByRole('radio', { name: 'Proceed with assumptions' })).not.toBeChecked();
    expect(button('Start')).toBeDisabled();
    expect(screen.getByRole('complementary', { name: 'Workspace' })).toHaveTextContent(
      'Step 1 of 5'
    );
    expect(screen.queryByRole('link', { name: 'Download for macOS' })).not.toBeInTheDocument();
    expect(screen.queryByText(BUSINESS.pack.title)).not.toBeInTheDocument();

    act(() => vi.advanceTimersByTime(120_000));
    expect(demo).toHaveAttribute('data-playback', 'idle');
    expect(interval).toHaveBeenCalledTimes(2);
  });

  it('resets to the first frame of the chosen scenario and clears a running interval', () => {
    const { demo, interval, clear } = setup();
    const pills = screen.getByRole('group', { name: 'Choose an example' });
    expect(within(pills).getAllByRole('button')).toHaveLength(3);
    expect(within(pills).getByRole('button', { name: 'Start a business' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );

    startWith('Proceed with assumptions');
    play(BUILD_MS / 2);
    expect(demo).toHaveAttribute('data-playback', 'playing');

    fireEvent.click(within(pills).getByRole('button', { name: 'Launch a product' }));
    expect(within(pills).getAllByRole('button', { pressed: true })).toHaveLength(1);
    expect(within(pills).getByRole('button', { name: 'Launch a product' })).toHaveAttribute(
      'aria-pressed',
      'true'
    );
    expect(demo).toHaveAttribute('data-node', 'gate');
    expect(demo).toHaveAttribute('data-playback', 'idle');
    expect(demo).toHaveTextContent(PRODUCT.request);
    expect(demo).not.toHaveTextContent(BUSINESS.request);
    expect(button('Start')).toBeDisabled();
    const workspace = screen.getByRole('complementary', { name: 'Workspace' });
    expect(workspace).toHaveTextContent('Step 1 of 5');
    expect(workspace).toHaveTextContent(PRODUCT.steps[4]);
    expect(clear).toHaveBeenCalledWith(interval.mock.results[0].value);

    act(() => vi.advanceTimersByTime(120_000));
    expect(demo).toHaveAttribute('data-playback', 'idle');
    expect(interval).toHaveBeenCalledTimes(1);
  });

  it('forgets a row picked for the previous scenario', () => {
    setup();
    fireEvent.click(screen.getByRole('radio', { name: 'Sure, ask me' }));
    fireEvent.click(button('Plan a campaign'));
    expect(screen.getByRole('radio', { name: 'Sure, ask me' })).not.toBeChecked();
    expect(button('Start')).toBeDisabled();
  });

  it('moves selection and focus across the scenario pills with arrows, Home and End', () => {
    const { demo } = setup();
    const business = button('Start a business');
    act(() => business.focus());
    fireEvent.keyDown(business, { key: 'ArrowRight' });
    expect(button('Launch a product')).toHaveFocus();
    expect(button('Launch a product')).toHaveAttribute('aria-pressed', 'true');
    fireEvent.keyDown(document.activeElement, { key: 'End' });
    expect(button('Plan a campaign')).toHaveFocus();
    fireEvent.keyDown(document.activeElement, { key: 'ArrowRight' });
    expect(business).toHaveFocus();
    fireEvent.keyDown(business, { key: 'ArrowLeft' });
    expect(button('Plan a campaign')).toHaveFocus();
    expect(demo).toHaveTextContent(SCENES[2].request);
    fireEvent.keyDown(document.activeElement, { key: 'Home' });
    expect(business).toHaveFocus();
    expect(business).toHaveAttribute('aria-pressed', 'true');

    fireEvent.keyDown(screen.getByRole('complementary', { name: 'Workspace' }), {
      key: 'ArrowRight',
    });
    expect(business).toHaveAttribute('aria-pressed', 'true');
    expect(demo).toHaveAttribute('data-playback', 'idle');
  });

  it('clears its interval when it unmounts mid-run', () => {
    const { interval, clear, unmount } = setup();
    startWith('Proceed with assumptions');
    play(BUILD_MS / 4);
    unmount();
    expect(interval).toHaveBeenCalledTimes(1);
    expect(clear).toHaveBeenCalledWith(interval.mock.results[0].value);
  });

  it('lets a waiting visitor skip to the results', () => {
    const { demo, interval, clear } = setup();
    startWith('Sure, ask me');
    play(QUESTION_MS + TICK_MS);
    fireEvent.click(button('Skip to results'));
    expect(demo).toHaveAttribute('data-node', 'results');
    expect(screen.getByRole('heading', { name: BUSINESS.pack.title })).toHaveFocus();
    play(RESULTS_MS + TICK_MS);
    expect(demo).toHaveAttribute('data-node', 'complete');
    expect(
      screen.getByText('Made with general assumptions. Answer 3 questions to fit it to you.')
    ).toBeInTheDocument();
    expect(interval).toHaveBeenCalledTimes(2);
    expectEveryIntervalCleared(interval, clear);
  });

  it('types the request only when asked to play from the start, and stops at the choice', () => {
    const { container, demo, interval, clear } = setup();
    fireEvent.click(button('Play from the start'));
    expect(demo).toHaveAttribute('data-node', 'intro');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
    expect(demo).not.toHaveTextContent(BUSINESS.planReply);

    play(1000);
    const typed = container.querySelector('.wiw-user').childNodes[1].textContent;
    expect(typed.length).toBeGreaterThan(0);
    expect(typed.length).toBeLessThan(BUSINESS.request.length);
    expect(BUSINESS.request.startsWith(typed)).toBe(true);

    play(INTRO_MS);
    expect(demo).toHaveAttribute('data-node', 'gate');
    expect(demo).toHaveAttribute('data-playback', 'awaiting');
    expect(demo).toHaveTextContent(BUSINESS.planReply);
    expect(button('Start')).toBeDisabled();

    const before = container.innerHTML;
    act(() => vi.advanceTimersByTime(120_000));
    expect(container.innerHTML).toBe(before);
    expect(interval).toHaveBeenCalledTimes(1);
    expectEveryIntervalCleared(interval, clear);
  });

  it('creates no interval under reduced motion and still lets the visitor answer', () => {
    mockReducedMotion();
    const { demo, interval } = setup();
    startWith('Sure, ask me');
    expect(demo).toHaveAttribute('data-node', 'answer');
    expect(screen.getByRole('heading', { name: 'Your Turn to Answer' })).toHaveFocus();

    pick('How will you sell?', 'Own shop');
    fireEvent.click(button('Send 1 answer'));
    expect(demo).toHaveAttribute('data-node', 'complete');
    expect(screen.getByText('fitted to: Own shop')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: BUSINESS.pack.title })).toHaveFocus();
    expect(screen.getByRole('link', { name: 'Download for macOS' })).toBeInTheDocument();

    fireEvent.click(button('Replay demo'));
    startWith('Proceed with assumptions');
    expect(demo).toHaveAttribute('data-node', 'complete');

    act(() => vi.advanceTimersByTime(120_000));
    expect(interval).not.toHaveBeenCalled();
  });

  it("wears the desktop app's sidebar as scenery: hidden, exact labels, nothing focusable", () => {
    const { container } = setup();
    const sidebar = container.querySelector('.wiw-sidebar');
    expect(sidebar).not.toBeNull();
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

    expect(
      sidebar.querySelectorAll(
        'a, button, input, select, textarea, summary, [tabindex], [contenteditable]'
      )
    ).toHaveLength(0);
    for (const row of sidebar.querySelectorAll('*')) {
      expect(['SPAN', 'I', 'svg', 'path', 'line']).toContain(row.tagName);
    }
    for (const glyph of sidebar.querySelectorAll('svg')) {
      expect(glyph).toHaveAttribute('aria-hidden', 'true');
      expect(glyph).toHaveAttribute('focusable', 'false');
    }
    expect(within(sidebar).queryAllByRole('button')).toHaveLength(0);

    fireEvent.click(button(PRODUCT.label));
    expect(labels()).toEqual(expected(PRODUCT.chatTitle));
  });

  it('keeps the app window standing while the chat fades and the pack rises inside it', () => {
    const { container } = setup();
    const app = container.querySelector('.wiw-app');
    expect(app.querySelector('.wiw-window')).not.toBeNull();
    expect(app.querySelector('.wiw-composer')).toHaveAttribute('aria-hidden', 'true');

    startWith('Proceed with assumptions');
    play(BUILD_MS + RESULTS_MS + 2 * TICK_MS);
    expect(container.querySelector('.wiw-app')).toBe(app);
    expect(app.querySelector('.wiw-window')).toBeNull();
    expect(app.querySelector('.wiw-sidebar')).not.toBeNull();
    expect(app.querySelector('.wiw-title')).toHaveTextContent(BUSINESS.chatTitle);
    expect(within(app).getByRole('heading', { name: BUSINESS.pack.title })).toBeInTheDocument();
  });

  it('labels each moment with a decorative callout and announces it in words', () => {
    const { container, demo } = setup();
    const shown = () =>
      [...container.querySelectorAll('.wiw-callout[data-visible="true"]')].map(
        (callout) => callout.textContent
      );
    for (const callout of container.querySelectorAll('.wiw-callout, .wiw-caption')) {
      expect(callout).toHaveAttribute('aria-hidden', 'true');
    }
    expect(shown()).toEqual(['It asks first', 'The plan']);
    expect(container.querySelector('.wiw-caption')).toHaveTextContent('It asks first · The plan');
    const status = screen.getByRole('status');
    const announced = [status.textContent];

    startWith('Sure, ask me');
    expect(shown()).toEqual([]);
    announced.push(status.textContent);
    play(QUESTION_MS + TICK_MS);
    pick('How will you sell?', 'Online');
    fireEvent.click(button('Send 1 answer'));
    expect(shown()).toEqual(['Workspace opens']);
    announced.push(status.textContent);
    play(BUILD_MS + TICK_MS);
    expect(shown()).toEqual(['Your files']);
    announced.push(status.textContent);
    play(RESULTS_MS + TICK_MS);
    expect(shown()).toEqual(['Your files']);
    expect(container.querySelector('.wiw-caption')).toHaveTextContent('Your files');
    announced.push(status.textContent);

    expect(new Set(announced).size).toBe(5);
    for (const words of announced) expect(words).toMatch(/\w+ \w+/);
    expect(demo.textContent).not.toMatch(PLANNED_PATTERN);
  });
});
