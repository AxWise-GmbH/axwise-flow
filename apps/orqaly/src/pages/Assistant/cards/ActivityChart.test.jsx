import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import ActivityChart from './ActivityChart';

const series = Array.from({ length: 90 }, (_, i) => ({
  date: `2026-04-${String((i % 28) + 1).padStart(2, '0')}`,
  count: i + 1,
}));

describe('ActivityChart', () => {
  it('renders the chart container with a default range and toggle buttons', () => {
    render(<ActivityChart activity={series} />);
    expect(screen.getByTestId('assistant-activity')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '7 days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '30 days' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '90 days' })).toBeInTheDocument();
  });

  it('switches the selected range when a toggle is pressed', () => {
    render(<ActivityChart activity={series} />);
    const sevenDay = screen.getByRole('button', { name: '7 days' });
    expect(sevenDay).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(sevenDay);
    expect(sevenDay).toHaveAttribute('aria-pressed', 'true');
  });

  it('shows an empty state when there is no activity', () => {
    render(<ActivityChart activity={[]} />);
    expect(screen.getByText(/no activity yet/i)).toBeInTheDocument();
  });
});
