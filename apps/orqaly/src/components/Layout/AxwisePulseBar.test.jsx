/**
 * Tests for AxwisePulseBar - a wrapper that conditionally renders PulseBar based
 * on useAxwise().isAxwiseEnabled. When enabled, PulseBar is mounted; when
 * disabled, nothing renders (and the usePulseFeed poll never starts).
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

// Mock useAxwise to control the gate.
const axwiseState = { isAxwiseEnabled: false };
vi.mock('../../hooks/useAxwise', () => ({
  useAxwise: () => axwiseState,
}));

// Mock PulseBar so we can detect when it renders.
vi.mock('./PulseBar', () => ({
  default: () => <div data-testid="pulsebar" />,
}));

import AxwisePulseBar from './AxwisePulseBar';

describe('AxwisePulseBar', () => {
  it('renders PulseBar when isAxwiseEnabled is true', () => {
    axwiseState.isAxwiseEnabled = true;
    render(<AxwisePulseBar />);
    expect(screen.getByTestId('pulsebar')).toBeTruthy();
  });

  it('renders nothing when isAxwiseEnabled is false', () => {
    axwiseState.isAxwiseEnabled = false;
    const { container } = render(<AxwisePulseBar />);
    expect(container.firstChild).toBeNull();
    expect(screen.queryByTestId('pulsebar')).toBeNull();
  });
});
