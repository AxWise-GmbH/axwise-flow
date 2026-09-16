import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import ModelBrandIcon from './ModelBrandIcon';

describe('ModelBrandIcon', () => {
  it('renders a brand glyph for a known maker', () => {
    render(<ModelBrandIcon model={{ name: 'Llama 3.1 70B', exactModel: 'Meta-Llama-3.1' }} />);
    expect(screen.getByLabelText('Meta logo')).toBeInTheDocument();
  });

  it('renders a monogram for Cohere (no vector available)', () => {
    render(<ModelBrandIcon model={{ name: 'Command R+', exactModel: 'c4ai-command-r-plus' }} />);
    const el = screen.getByLabelText('Cohere logo');
    expect(el).toHaveTextContent('C');
  });

  it('falls back to a generic server icon for an unknown maker', () => {
    const { container } = render(<ModelBrandIcon model={{ name: 'Homegrown 7B' }} />);
    // No brand label; MUI icon renders as an <svg> without our aria-label.
    expect(screen.queryByLabelText(/logo$/)).not.toBeInTheDocument();
    expect(container.querySelector('svg')).toBeInTheDocument();
  });
});
