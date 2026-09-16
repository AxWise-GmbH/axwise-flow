import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { ThemeProvider, createTheme } from '@mui/material/styles';

beforeAll(() => {
  globalThis.ResizeObserver = class {
    observe() {}
    disconnect() {}
    unobserve() {}
  };
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({
    clearRect: vi.fn(),
    fillStyle: '',
    beginPath: vi.fn(),
    arc: vi.fn(),
    fill: vi.fn(),
    createRadialGradient: vi.fn(() => ({ addColorStop: vi.fn() })),
  }));
});

const useSimpleModeMock = vi.fn(() => ({
  simpleMode: true,
  setSimpleMode: vi.fn(),
  toggleSimpleMode: vi.fn(),
}));

vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: () => useSimpleModeMock(),
}));

const { navigateMock } = vi.hoisted(() => ({ navigateMock: vi.fn() }));

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return { ...actual, useNavigate: () => navigateMock };
});

import MarketplaceLanding from './MarketplaceLanding';

const theme = createTheme();
function Wrap({ children }) {
  return (
    <MemoryRouter>
      <ThemeProvider theme={theme}>{children}</ThemeProvider>
    </MemoryRouter>
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  useSimpleModeMock.mockReturnValue({
    simpleMode: true,
    setSimpleMode: vi.fn(),
    toggleSimpleMode: vi.fn(),
  });
});

describe('MarketplaceLanding simple mode tile order', () => {
  it('renders tiles in Consilium → Orgs → Agents → Skills → Tools → Business → Account order', () => {
    const { container } = render(
      <Wrap>
        <MarketplaceLanding />
      </Wrap>
    );
    const grid = container.querySelector('.mkt-grid--marketplace-simple');
    expect(grid).toBeTruthy();

    const ordered = [...grid.querySelectorAll('[data-tile-id]')].map((el) =>
      el.getAttribute('data-tile-id')
    );
    expect(ordered).toEqual([
      'teams',
      'orgs',
      'agents',
      'skills',
      'tools',
      'businesses',
      'account',
    ]);
  });

  it('shows updated simple-mode tile subtitles', () => {
    render(
      <Wrap>
        <MarketplaceLanding />
      </Wrap>
    );
    expect(screen.getByText('Consilium')).toBeTruthy();
    expect(screen.getByText('Skills')).toBeTruthy();
    expect(screen.getByText('Tools')).toBeTruthy();
    expect(screen.getByText('Choose board members for your business')).toBeTruthy();
    expect(screen.getByText('Add skills to agents and upgrade them')).toBeTruthy();
    expect(screen.getByText('Use or upload your integrations or libraries')).toBeTruthy();
    expect(screen.getByText('Models')).toBeTruthy();
    expect(screen.queryByText('Business models')).toBeNull();
  });

  it('opens the AI models tab from the historical businesses tile', () => {
    render(
      <Wrap>
        <MarketplaceLanding />
      </Wrap>
    );

    fireEvent.click(screen.getByText('Models'));

    expect(navigateMock).toHaveBeenCalledWith('/marketplace/browse?tab=models');
  });

  it('keeps the advanced-mode two-section layout when simple mode is off', () => {
    useSimpleModeMock.mockReturnValue({
      simpleMode: false,
      setSimpleMode: vi.fn(),
      toggleSimpleMode: vi.fn(),
    });
    const { container } = render(
      <Wrap>
        <MarketplaceLanding />
      </Wrap>
    );
    expect(container.querySelector('.mkt-grid--marketplace-simple')).toBeNull();
    expect(container.querySelector('.mkt-grid--s1')).toBeTruthy();
    expect(container.querySelector('.mkt-grid--s2')).toBeTruthy();
  });
});
