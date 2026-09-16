import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import DemoControlCenter from './DemoControlCenter';

describe('DemoControlCenter', () => {
  it('renders the tasks, workflow, and conversations widgets', () => {
    render(<DemoControlCenter />);
    expect(screen.getByText('Tasks')).toBeInTheDocument();
    expect(screen.getByText('Workflow')).toBeInTheDocument();
    expect(screen.getByText('Conversations')).toBeInTheDocument();
    // Workflow steps + a message line.
    expect(screen.getByText('Trigger')).toBeInTheDocument();
    expect(screen.getByText(/Approved refund for order/i)).toBeInTheDocument();
  });
});
