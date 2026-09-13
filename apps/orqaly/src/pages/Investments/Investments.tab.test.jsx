import { describe, it, expect, vi, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

beforeAll(() => {
  global.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
});

vi.mock('../../hooks/useShowMetrics', () => ({
  useShowMetrics: () => [false, vi.fn()],
}));

vi.mock('../../services/investmentService', () => ({
  listDeals: vi.fn(async () => []),
  createDeal: vi.fn(async () => ({})),
  listInvestors: vi.fn(async () => []),
  createInvestor: vi.fn(async () => ({})),
  listPools: vi.fn(async () => []),
  createPool: vi.fn(async () => ({})),
  commitToDeal: vi.fn(async () => ({})),
  listCommitments: vi.fn(async () => []),
  startCouncil: vi.fn(async () => ({})),
  getCouncilStatus: vi.fn(async () => ({})),
}));

import Investments from './Investments';

const theme = createTheme();
function renderAt(path) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <ThemeProvider theme={theme}>
        <Investments />
      </ThemeProvider>
    </MemoryRouter>
  );
}

describe('Investments tab from URL', () => {
  it('opens the Investors tab when ?tab=investors is present', async () => {
    renderAt('/investments?tab=investors');
    expect(await screen.findByText('No investors registered yet.')).toBeInTheDocument();
  });

  it('defaults to the Deals tab when no tab param is present', async () => {
    renderAt('/investments');
    expect(screen.queryByText('No investors registered yet.')).not.toBeInTheDocument();
  });
});
