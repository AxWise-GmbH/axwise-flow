import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import ChartReveal from './ChartReveal';

beforeAll(() => {
  window.matchMedia =
    window.matchMedia ||
    ((query) => ({
      matches: false,
      media: query,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }));
});

describe('ChartReveal', () => {
  // jsdom has no IntersectionObserver, so useInView reports in-view immediately
  // and children mount right away.
  it('renders its children when in view (jsdom path)', () => {
    render(
      <ChartReveal>
        <div>chart-content</div>
      </ChartReveal>
    );
    expect(screen.getByText('chart-content')).toBeInTheDocument();
  });

  it('applies the placeholder minHeight to the container', () => {
    const { container } = render(
      <ChartReveal minHeight={220}>
        <div>x</div>
      </ChartReveal>
    );
    expect(container.firstChild).toHaveStyle({ minHeight: '220px' });
  });
});
