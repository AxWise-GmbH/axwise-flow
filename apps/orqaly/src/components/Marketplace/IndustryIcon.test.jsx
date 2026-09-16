import { describe, it, expect, vi } from 'vitest';
import { render } from '@testing-library/react';

vi.mock('../icons/AppIcon', () => ({
  default: ({ size, sx }) => (
    <svg data-testid="app-icon" data-size={size} style={{ color: sx?.color }} />
  ),
}));

import IndustryIcon from './IndustryIcon';

describe('IndustryIcon', () => {
  it('renders an svg icon for a known industry', () => {
    const { container } = render(<IndustryIcon industry="Finance" icon="account_balance" />);
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('renders (via generic fallback) for an unknown industry', () => {
    const { container } = render(<IndustryIcon industry="Nonsense Sector" />);
    // Fallback groups icon still renders an svg so the card keeps a glyph.
    expect(container.querySelector('svg')).toBeInTheDocument();
  });

  it('applies the provided color', () => {
    const { container } = render(<IndustryIcon industry="Energy" icon="bolt" color="#16A34A" />);
    const svg = container.querySelector('svg');
    expect(svg).toHaveStyle({ color: '#16A34A' });
  });

  it("forwards size through AppIcon's supported size prop", () => {
    const { container } = render(<IndustryIcon industry="Energy" size={17} />);
    expect(container.querySelector('[data-size]').getAttribute('data-size')).toBe('17');
  });
});
