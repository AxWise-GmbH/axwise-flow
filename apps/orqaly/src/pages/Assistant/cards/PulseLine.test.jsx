import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import PulseLine from './PulseLine';

describe('PulseLine', () => {
  it('renders an accessible pulse with two heartbeat traces', () => {
    const { container } = render(<PulseLine />);
    expect(screen.getByTestId('profile-pulse')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /pulse/i })).toBeInTheDocument();
    // A faint base trace + the animated travelling trace.
    expect(container.querySelectorAll('path')).toHaveLength(2);
  });
});
