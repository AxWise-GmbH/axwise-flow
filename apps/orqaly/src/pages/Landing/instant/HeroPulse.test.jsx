import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render } from '@testing-library/react';
import HeroPulse, { PULSE_LINK_LABEL } from './HeroPulse';

function scene(container) {
  return container.querySelector('.hp-scene');
}

function agentStates(container) {
  return [...container.querySelectorAll('.hp-agent')].map((node) => node.dataset.state);
}

function advance(ms) {
  act(() => {
    vi.advanceTimersByTime(ms);
  });
}

// Every step arms the next one from an effect, so the clock is walked one timer at a time.
function step() {
  act(() => {
    vi.advanceTimersToNextTimer();
  });
}

function runUntil(check, limit = 400) {
  for (let count = 0; count < limit && !check(); count += 1) step();
  expect(check()).toBe(true);
}

function mockReducedMotion(reduce) {
  vi.stubGlobal(
    'matchMedia',
    vi.fn((query) => ({
      matches: reduce && query.includes('prefers-reduced-motion'),
      media: query,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    }))
  );
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe('HeroPulse', () => {
  it('starts on an empty message box with the app placeholder and idle agents', () => {
    const { container } = render(<HeroPulse />);
    expect(scene(container)).toHaveAttribute('data-phase', 'ask');
    expect(container.querySelector('.hp-ask-text')).toHaveTextContent(
      "Ask whatever's on your mind."
    );
    expect(agentStates(container)).toEqual(['idle', 'idle', 'idle']);
  });

  it('types the ask, walks the three agents in order, then lands the files', () => {
    const { container } = render(<HeroPulse />);
    const phase = () => scene(container).dataset.phase;
    runUntil(() => phase() === '1');
    expect(container.querySelector('.hp-ask-text')).toHaveTextContent('Plan my coffee roastery.');
    expect(agentStates(container)).toEqual(['now', 'idle', 'idle']);

    step();
    expect(agentStates(container)).toEqual(['done', 'now', 'idle']);

    step();
    expect(agentStates(container)).toEqual(['done', 'done', 'now']);

    step();
    expect(phase()).toBe('made');
    expect(agentStates(container)).toEqual(['done', 'done', 'done']);
    expect(container.querySelectorAll('.hp-file')).toHaveLength(4);
  });

  it('moves on to the next ask with another model, and comes back round to the first', () => {
    const { container } = render(<HeroPulse />);
    const seen = new Set();
    const model = () => container.querySelector('.hp-model').textContent;
    for (let count = 0; count < 130; count += 1) {
      step();
      seen.add(model());
    }
    expect([...seen]).toEqual(['Gemini', 'OpenAI', 'Anthropic']);
    runUntil(() => model() === 'Gemini');
    expect(agentStates(container)).toEqual(['idle', 'idle', 'idle']);
  });

  it('stands still while paused and carries on afterwards', () => {
    const { container, rerender } = render(<HeroPulse paused />);
    advance(5000);
    expect(container.querySelector('.hp-ask-text')).toHaveTextContent(
      "Ask whatever's on your mind."
    );
    rerender(<HeroPulse paused={false} />);
    runUntil(() => container.querySelector('.hp-ask-text').textContent.startsWith('Plan'));
  });

  it('rests on the first finished scene when motion is reduced', () => {
    mockReducedMotion(true);
    const { container } = render(<HeroPulse />);
    expect(scene(container)).toHaveAttribute('data-phase', 'made');
    expect(container.querySelector('.hp-ask-text')).toHaveTextContent('Plan my coffee roastery.');
    advance(20000);
    expect(scene(container)).toHaveAttribute('data-phase', 'made');
    expect(container.querySelector('.hp-model')).toHaveTextContent('Gemini');
  });

  it('is one labelled link with hidden, unfocusable insides and one part per hero label', () => {
    const { container } = render(<HeroPulse />);
    const link = container.querySelector('a');
    expect(link).toHaveAttribute('href', '#watch');
    expect(link).toHaveAttribute('aria-label', PULSE_LINK_LABEL);
    expect(link.children).toHaveLength(1);
    expect(link.firstElementChild).toHaveAttribute('aria-hidden', 'true');
    expect(link.querySelector('a, button, input, [tabindex]')).toBeNull();
    for (const key of ['ready', 'orchestration', 'layering', 'llms', 'plugins', 'voice', 'build']) {
      expect(container.querySelectorAll(`[data-region~='${key}']`)).toHaveLength(1);
    }
    expect(container.querySelector('img, iframe, video, canvas')).toBeNull();
  });
});
