import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import CommunicationActivityCard from './CommunicationActivityCard';

describe('CommunicationActivityCard', () => {
  it('renders the title and the activity chart', () => {
    render(<CommunicationActivityCard activity={[{ date: '2026-06-28', count: 7 }]} />);
    expect(screen.getByText('Communication Activity')).toBeInTheDocument();
    expect(screen.getByTestId('assistant-activity')).toBeInTheDocument();
  });

  it('shows the empty state when there is no activity', () => {
    render(<CommunicationActivityCard activity={[]} />);
    expect(screen.getByTestId('assistant-activity')).toBeInTheDocument();
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });
});
