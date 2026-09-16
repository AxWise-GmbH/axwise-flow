import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import { ThemeProvider, createTheme } from '@mui/material/styles';

// Mock useSimpleMode so we can flip the flag per-test.
let simpleModeValue = true;
vi.mock('../../hooks/useSimpleMode', () => ({
  useSimpleMode: () => ({
    simpleMode: simpleModeValue,
    setSimpleMode: vi.fn(),
    toggleSimpleMode: vi.fn(),
  }),
}));

import GlassIcon from './GlassIcon';
import HomeRoundedIcon from '@mui/icons-material/HomeRounded';
import CorporateFareIcon from '@mui/icons-material/CorporateFare';

const theme = createTheme();
function Wrap({ children }) {
  return <ThemeProvider theme={theme}>{children}</ThemeProvider>;
}

describe('GlassIcon', () => {
  beforeEach(() => {
    simpleModeValue = true;
  });

  it('renders the glass SVG when simple mode is on and name is mapped', () => {
    simpleModeValue = true;
    const { container } = render(
      <Wrap>
        <GlassIcon name="HomeRounded" fallback={HomeRoundedIcon} size={32} data-testid="icon" />
      </Wrap>
    );
    const svg = container.querySelector('svg');
    // Liquid Glass SVGs use multiple linearGradient defs; MUI Home is a single <path>.
    expect(svg).toBeTruthy();
    expect(svg.querySelectorAll('linearGradient').length).toBeGreaterThan(0);
    // Should respect explicit size
    expect(svg.getAttribute('width')).toBe('32');
    expect(svg.getAttribute('height')).toBe('32');
  });

  it('falls back to the MUI icon when simple mode is off', () => {
    simpleModeValue = false;
    const { container } = render(
      <Wrap>
        <GlassIcon name="HomeRounded" fallback={HomeRoundedIcon} />
      </Wrap>
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // MUI icons have no <linearGradient> — verifies glass path NOT taken.
    expect(svg.querySelectorAll('linearGradient').length).toBe(0);
  });

  it('falls back to the MUI icon in simple mode when name is unmapped', () => {
    simpleModeValue = true;
    const { container } = render(
      <Wrap>
        <GlassIcon name="ThisNameDoesNotExist" fallback={CorporateFareIcon} />
      </Wrap>
    );
    const svg = container.querySelector('svg');
    expect(svg).toBeTruthy();
    // No gradient defs → MUI path was used.
    expect(svg.querySelectorAll('linearGradient').length).toBe(0);
  });

  it('wraps in a tile when tile prop is true', () => {
    simpleModeValue = true;
    const { container } = render(
      <Wrap>
        <GlassIcon
          name="HomeRounded"
          fallback={HomeRoundedIcon}
          size={24}
          tile
          data-testid="tile"
        />
      </Wrap>
    );
    const tile = container.querySelector('[data-testid="tile"]');
    expect(tile).toBeTruthy();
    // Tile is the outer Box containing the svg
    expect(tile.querySelector('svg')).toBeTruthy();
  });

  it('renders no tile by default', () => {
    simpleModeValue = true;
    const { container } = render(
      <Wrap>
        <GlassIcon name="HomeRounded" fallback={HomeRoundedIcon} data-testid="icon" />
      </Wrap>
    );
    // Without `tile`, the SVG is the rendered element directly.
    const direct = container.querySelector('[data-testid="icon"]');
    expect(direct?.tagName.toLowerCase()).toBe('svg');
  });

  it('returns null when no fallback is provided outside simple mode', () => {
    simpleModeValue = false;
    const { container } = render(
      <Wrap>
        <GlassIcon name="HomeRounded" />
      </Wrap>
    );
    expect(container.firstChild).toBeNull();
  });
});
