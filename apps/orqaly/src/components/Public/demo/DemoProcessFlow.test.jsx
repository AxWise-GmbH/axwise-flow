import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DemoProcessFlow from './DemoProcessFlow';

describe('DemoProcessFlow', () => {
  it('renders the five plain-language steps with captions', () => {
    render(<DemoProcessFlow />);
    ['Goal', 'Consilium', 'Team', 'Tools', 'Result'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
    expect(screen.getByText('Ask in plain text')).toBeInTheDocument();
    expect(screen.getByText(/Use any AI service to code, design, write/i)).toBeInTheDocument();
  });
});
