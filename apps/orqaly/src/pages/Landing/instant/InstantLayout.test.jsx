import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import InstantLayout from './InstantLayout';

function renderLayout(props) {
  return render(
    <MemoryRouter>
      <InstantLayout title="Test page" {...props}>
        <p>Page body</p>
      </InstantLayout>
    </MemoryRouter>
  );
}

const root = (container) => container.querySelector('[data-landing-root]');
const geistLink = () => document.head.querySelector('link[href*="family=Geist"]');

describe('InstantLayout opening', () => {
  afterEach(() => {
    delete document.fonts;
    vi.useRealTimers();
  });

  it('has no loading curtain: the page is there from the first frame', () => {
    const { container } = renderLayout({ entrance: true });
    expect(container.querySelector('.oi-loader')).toBeNull();
    expect(container.querySelector('[data-orb]')).toBeNull();
    expect(container).toHaveTextContent('Page body');
  });

  it('leaves pages without an entrance alone', () => {
    const { container } = renderLayout();
    expect(root(container)).not.toHaveAttribute('data-entrance');
  });

  it('plays at once when the browser has no font API to wait on', () => {
    const { container } = renderLayout({ entrance: true });
    expect(root(container)).toHaveAttribute('data-entrance', 'go');
  });

  it('holds the entrance until the first screen fonts are in', async () => {
    const load = vi.fn(() => Promise.resolve([]));
    document.fonts = { load };
    const { container } = renderLayout({ entrance: true });
    expect(root(container)).toHaveAttribute('data-entrance', 'wait');

    await act(async () => {
      geistLink().dispatchEvent(new Event('load'));
    });
    expect(load).toHaveBeenCalledWith('400 1em Geist');
    // The hero's second line is set in the light weight.
    expect(load).toHaveBeenCalledWith('300 1em Geist');
    expect(root(container)).toHaveAttribute('data-entrance', 'go');
  });

  it('never waits longer than 1.5 s for a slow font', () => {
    vi.useFakeTimers();
    document.fonts = { load: () => new Promise(() => {}) };
    const { container } = renderLayout({ entrance: true });
    expect(root(container)).toHaveAttribute('data-entrance', 'wait');

    act(() => vi.advanceTimersByTime(1499));
    expect(root(container)).toHaveAttribute('data-entrance', 'wait');
    act(() => vi.advanceTimersByTime(1));
    expect(root(container)).toHaveAttribute('data-entrance', 'go');
  });
});
