import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SimpleContentFrame from './SimpleContentFrame';

describe('SimpleContentFrame', () => {
  it('wraps children in .simple-frame > .simple-frame__inner when active (simple mode)', () => {
    const { container } = render(
      <SimpleContentFrame active>
        <div data-testid="page">content</div>
      </SimpleContentFrame>
    );
    const frame = container.querySelector('.simple-frame');
    const inner = container.querySelector('.simple-frame__inner');
    expect(frame).toBeTruthy();
    expect(inner).toBeTruthy();
    // The centered inner is a child of the frame, and the page renders inside it.
    expect(frame.contains(inner)).toBe(true);
    expect(inner.contains(screen.getByTestId('page'))).toBe(true);
  });

  it('renders children with no wrapper when inactive (advanced mode)', () => {
    const { container } = render(
      <SimpleContentFrame active={false}>
        <div data-testid="page">content</div>
      </SimpleContentFrame>
    );
    expect(container.querySelector('.simple-frame')).toBeNull();
    expect(container.querySelector('.simple-frame__inner')).toBeNull();
    expect(screen.getByTestId('page')).toBeTruthy();
  });
});
