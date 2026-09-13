import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DemoOrgStructure from './DemoOrgStructure';

describe('DemoOrgStructure', () => {
  it('renders the Consilium board, a directorate, a team, and the legend', () => {
    render(<DemoOrgStructure />);
    expect(screen.getByText(/Consilium . Directors/i)).toBeInTheDocument();
    expect(screen.getByText(/Strategic oversight/i)).toBeInTheDocument();
    expect(screen.getByText('Operations')).toBeInTheDocument();
    expect(screen.getByText('Process Automation')).toBeInTheDocument();
    expect(screen.getByText('AI Agent')).toBeInTheDocument();
  });
});
