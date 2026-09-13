import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mobile toggle: the pill reads useMediaQuery from @mui/material.
const mq = vi.hoisted(() => ({ mobile: true }));
vi.mock('@mui/material', async (orig) => {
  const actual = await orig();
  return { ...actual, useMediaQuery: () => mq.mobile };
});

const axState = { isAxwiseEnabled: true };
vi.mock('../../hooks/useAxwise', () => ({ useAxwise: () => axState }));

const prefState = { hidden: false, view: 'minimized' };
const setView = vi.fn();
vi.mock('../../hooks/usePulseBarPref', () => ({
  usePulseBarPref: () => ({ ...prefState, setView }),
}));

const feed = { summary: { axwise: 3, worst: 'warn' } };
vi.mock('../../hooks/usePulseFeed', () => ({ usePulseFeed: () => feed }));

import AxwiseHeaderPill from './AxwiseHeaderPill';

const theme = createTheme();
function renderPill() {
  return render(
    <ThemeProvider theme={theme}>
      <AxwiseHeaderPill />
    </ThemeProvider>
  );
}

describe('AxwiseHeaderPill', () => {
  beforeEach(() => {
    mq.mobile = true;
    axState.isAxwiseEnabled = true;
    prefState.hidden = false;
    prefState.view = 'minimized';
    feed.summary = { axwise: 3, worst: 'warn' };
    vi.clearAllMocks();
  });

  it('shows the count and opens the bar on tap when active on mobile', () => {
    renderPill();
    expect(screen.getByText('3')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /show axwise status bar/i }));
    expect(setView).toHaveBeenCalledWith('collapsed');
  });

  it('renders nothing on desktop', () => {
    mq.mobile = false;
    const { container } = renderPill();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the bar is not minimized', () => {
    prefState.view = 'collapsed';
    const { container } = renderPill();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when AxWise is disabled', () => {
    axState.isAxwiseEnabled = false;
    const { container } = renderPill();
    expect(container.firstChild).toBeNull();
  });

  it('renders nothing when the bar is hidden', () => {
    prefState.hidden = true;
    const { container } = renderPill();
    expect(container.firstChild).toBeNull();
  });
});
