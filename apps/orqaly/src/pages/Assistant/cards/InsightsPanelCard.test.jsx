import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import InsightsPanelCard from './InsightsPanelCard';

// Capture the props passed to the shared BentoCard so we can assert the
// card opts into the clean (untinted) header.
const bentoProps = [];
vi.mock('../../../components/Common/BentoCard', () => ({
  default: ({ children, ...props }) => {
    bentoProps.push(props);
    return <div data-testid="bento">{children}</div>;
  },
}));

const insights = {
  description: 'Generate AI-powered insights about your assistant.',
  privateNote: 'Insights are private to your team',
};

describe('InsightsPanelCard', () => {
  beforeEach(() => {
    bentoProps.length = 0;
  });

  it('renders the description and generate action', () => {
    render(<InsightsPanelCard insights={insights} onGenerate={() => {}} />);
    expect(screen.getByText(insights.description)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /generate insights/i })).toBeInTheDocument();
    expect(screen.getByText(insights.privateNote)).toBeInTheDocument();
  });

  it('uses a plain (untinted) header for a clean look', () => {
    render(<InsightsPanelCard insights={insights} onGenerate={() => {}} />);
    expect(bentoProps[0].plainHeader).toBe(true);
  });
});
