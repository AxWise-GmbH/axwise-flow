import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DemoAssistantSetup from './DemoAssistantSetup';

describe('DemoAssistantSetup', () => {
  it('renders the four assistant tabs', () => {
    render(<DemoAssistantSetup />);
    ['Finish Briefing', 'Choose LLM', 'View Insights', 'Make Decisions'].forEach((label) => {
      expect(screen.getByText(label)).toBeInTheDocument();
    });
  });

  it('shows the briefing snapshot', () => {
    render(<DemoAssistantSetup />);
    expect(screen.getByText(/Assistant briefing/i)).toBeInTheDocument();
    expect(screen.getByText(/What does your business do/i)).toBeInTheDocument();
  });
});
